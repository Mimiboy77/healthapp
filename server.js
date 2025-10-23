require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const Consultation = require('./models/Consultation');
const User = require('./models/User'); // ✅ add this

// Import routes
const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const patientRoutes = require('./routes/patientRoutes');
const doctorRoutes = require('./routes/doctorRoutes');
const pharmacyRoutes = require('./routes/pharmacyRoutes');
const adminRoutes = require('./routes/adminRoutes');
const chatRoutes = require('./routes/chatRoutes');
const walletRoutes = require('./routes/walletRoutes');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ========================
// CONNECT TO DATABASE

connectDB(); // no need to pass URI anymore


// ========================
// VIEW ENGINE CONFIG
// ========================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ========================
// MIDDLEWARES
// ========================
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ========================
// SESSION CONFIG
// ========================
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'secret',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGO_URI }),
  cookie: { maxAge: 1000 * 60 * 60 * 24 } // 1 day
});
app.use(sessionMiddleware);

// ========================
// SHARE SESSION WITH SOCKET.IO
// ========================
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

// Make Socket.IO available in routes
app.set('io', io);
app.use((req, res, next) => {
  req.io = io;
  next();
});

// ✅ Always refresh session user before rendering views
app.use(async (req, res, next) => {
  try {
    if (req.session.user?._id) {
      const freshUser = await User.findById(req.session.user._id).lean();
      if (freshUser) {
        req.session.user = freshUser;
        res.locals.currentUser = freshUser;
      }
    } else {
      res.locals.currentUser = null;
    }
    next();
  } catch (err) {
    console.error('Error refreshing session user:', err);
    next();
  }
});

// ========================
// ROUTES
// ========================
app.use('/', authRoutes);
app.use('/patient', patientRoutes);
app.use('/doctor', doctorRoutes);
app.use('/pharmacy', pharmacyRoutes);
app.use('/admin', adminRoutes);
app.use('/chat', chatRoutes);
app.use('/wallet', walletRoutes); // ✅ changed from "/" to "/wallet" for clarity

// Default route
app.get('/', (req, res) => res.redirect('/select-role'));

// ========================
// SOCKET.IO CHAT HANDLER
// ========================
io.on('connection', (socket) => {
  console.log('🔌 User connected to socket');

  // JOIN CONSULTATION ROOM
  socket.on('joinRoom', ({ consultationId }) => {
    if (!consultationId) return;

    if (consultationId.startsWith('consultation-')) {
      consultationId = consultationId.replace('consultation-', '');
    }

    socket.join(consultationId);
    console.log(`✅ Joined room: ${consultationId}`);
  });

  // MESSAGE HANDLER
  socket.on('message', async (data) => {
    try {
      let { consultationId, sender, message, timestamp } = data;
      if (!consultationId || !message) return;

      if (consultationId.startsWith('consultation-')) {
        consultationId = consultationId.replace('consultation-', '');
      }

      if (!mongoose.Types.ObjectId.isValid(consultationId)) {
        console.warn(`⚠️ Invalid consultation ID: ${consultationId}`);
        return;
      }

      // Broadcast message to room
      io.to(consultationId).emit('message', { sender, message, timestamp });

      // Save chat message to DB
      const cons = await Consultation.findById(consultationId);
      if (cons) {
        cons.messages.push({ sender, message, timestamp: timestamp || Date.now() });
        await cons.save();
      } else {
        console.warn(`⚠️ Consultation not found for chat save: ${consultationId}`);
      }
    } catch (err) {
      console.error('💥 Chat socket error:', err);
    }
  });

  // PRESCRIPTION NOTIFICATIONS
  socket.on('subscribePrescriptions', (userId) => {
    if (userId) socket.join(`user-${userId}`);
  });

  socket.on('disconnect', () => {
    console.log('❌ User disconnected');
  });
});

// ========================
// START SERVER
// ========================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () =>
  console.log(`🚀 Server running on http://localhost:${PORT}`)
);
