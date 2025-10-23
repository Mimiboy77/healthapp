// services/hederaService.js
const { Client, PrivateKey, AccountCreateTransaction, Hbar, TransferTransaction, AccountBalanceQuery } = require('@hashgraph/sdk');
const { nanoid } = require('nanoid');
const CryptoJS = require('crypto-js');

const OPERATOR_ID = process.env.OPERATOR_ID; // e.g. "0.0.x"
const OPERATOR_KEY = process.env.OPERATOR_KEY; // private key string
const HEDERA_NETWORK = process.env.HEDERA_NETWORK || 'testnet'; // 'testnet' or 'mainnet'
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'change-me-please';

// create client
function hederaClient() {
  if (HEDERA_NETWORK === 'mainnet') {
    return Client.forMainnet().setOperator(OPERATOR_ID, OPERATOR_KEY);
  }
  return Client.forTestnet().setOperator(OPERATOR_ID, OPERATOR_KEY);
}

function encryptPrivateKey(privateKeyString) {
  return CryptoJS.AES.encrypt(privateKeyString, ENCRYPTION_KEY).toString();
}

function decryptPrivateKey(encryptedString) {
  const bytes = CryptoJS.AES.decrypt(encryptedString, ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

// create new Hedera account (server creates keypair and account)
async function createHederaAccount(initialHbar = 0) {
  const client = hederaClient();
  const newKey = PrivateKey.generateED25519();
  const tx = await new AccountCreateTransaction()
    .setKey(newKey.publicKey)
    .setInitialBalance(new Hbar(initialHbar)) // initial funding from operator (treasury)
    .execute(client);
  const receipt = await tx.getReceipt(client);
  const accountId = receipt.accountId.toString();
  return {
    accountId,
    privateKey: newKey.toString() // keep encrypted before saving
  };
}

async function transferHbar(fromAccountId, fromPrivateKeyString, toAccountId, amountHbar) {
  // amountHbar float -> Hbar
  const client = hederaClient();
  const fromKey = PrivateKey.fromString(fromPrivateKeyString);
  // create a client with payer = from account (we need to sign with from private key)
  const payerClient = hederaClient();
  payerClient.setOperator(fromAccountId, fromPrivateKeyString);

  const tx = await new TransferTransaction()
    .addHbarTransfer(fromAccountId, new Hbar(-amountHbar))
    .addHbarTransfer(toAccountId, new Hbar(amountHbar))
    .freezeWith(payerClient);

  // sign and submit with payer key
  const signed = await tx.sign(fromKey);
  const submit = await signed.execute(payerClient);
  const receipt = await submit.getReceipt(payerClient);
  return { transactionId: submit.transactionId.toString(), status: receipt.status.toString() };
}

async function transferFromServerTo(toAccountId, amountHbar) {
  // operator/treasury sends to toAccountId
  const client = hederaClient();
  const tx = await new TransferTransaction()
    .addHbarTransfer(OPERATOR_ID, new Hbar(-amountHbar))
    .addHbarTransfer(toAccountId, new Hbar(amountHbar))
    .execute(client);
  const receipt = await tx.getReceipt(client);
  return { transactionId: tx.transactionId.toString(), status: receipt.status.toString() };
}

async function getBalance(accountId) {
  const client = hederaClient();
  const bal = await new AccountBalanceQuery().setAccountId(accountId).execute(client);
  // returns object with hbars property
  return Number(bal.hbars.toString()); // convert to string then number (HBAR)
}

module.exports = {
  hederaClient,
  createHederaAccount,
  encryptPrivateKey,
  decryptPrivateKey,
  transferHbar,
  transferFromServerTo,
  getBalance
};
