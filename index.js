const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');

const app = express();
app.use(express.json());

let socket;
let qrCodeData = null; // Variable to store QR code data URL

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');

  const connectionOptions = {
    logger: pino({ level: 'info' }),
    auth: state,
    printQRInTerminal: true,
    mobile: false,
    browser: ['Chrome (Linux)', '', ''],
    getMessage: async (key) => {
      return '';
    },
    connectTimeoutMs: 60000,
    generateHighQualityLinkPreview: true,
    syncFullHistory: true,
    markOnlineOnConnect: true,
  };

  socket = makeWASocket(connectionOptions);

  socket.ev.on('creds.update', saveCreds);
  socket.ev.on('connection.update', async (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr) {
      qrCodeData = await QRCode.toDataURL(qr);
      console.log('QR code generated, access it through the /qr endpoint.');
    }

    if (connection === 'open') {
      console.log('BOT WHATSAPP READY!');
    } else if (connection === 'close') {
      if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
        console.log('WhatsApp connection closed. Reconnecting...');
        connectToWhatsApp();
      } else {
        console.log('WhatsApp connection logged out. Please scan the QR code again.');
      }
    }
  });

  socket.ev.on('connection.error', (error) => {
    console.error('Connection errored', error);
  });
}

connectToWhatsApp();

app.use((req, res, next) => {
  if (!socket || !socket.user) {
    return res.status(503).send({ error: 'WhatsApp connection not established yet. Please try again later.' });
  }
  next();
});

app.get('/admin-number', (req, res) => {
  const adminNumber = '6281234567890';
  res.send({ adminNumber });
});

app.get('/qr', (req, res) => {
  if (qrCodeData) {
    res.send(`<img src="${qrCodeData}" alt="Scan this QR code with WhatsApp" />`);
  } else {
    res.status(503).send({ error: 'QR code not generated yet. Please try again later.' });
  }
});

app.post('/send-message', async (req, res) => {
  const { phone, message } = req.body;
  if (!phone || !message) {
    return res.status(400).send({ error: 'Phone and message are required' });
  }

  try {
    await socket.sendMessage(phone + '@s.whatsapp.net', { text: message });
    res.send({ status: 'Message sent' });
  } catch (error) {
    res.status(500).send({ error: 'Failed to send message', details: error });
  }
});

module.exports = app;
