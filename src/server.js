require('dotenv').config();

const http = require('http');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');

const { sessionStore, pool } = require('./models/db');
const { ensureRegistrationSetup } = require('./services/bootstrap');
const authRoutes = require('./routes/authRoutes');
const profileRoutes = require('./routes/profileRoutes');
const viewRoutes = require('./routes/viewRoutes');
const tableRoutes = require('./routes/tableRoutes');

const app = express();
const server = http.createServer(app);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const sessionParser = session({
  key: 'sid',
  secret: process.env.SESSION_SECRET || 'change-me-now',
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: {
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'lax'
  }
});

app.use(
  helmet({
    contentSecurityPolicy: false
  })
);
app.use(morgan('dev'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(sessionParser);
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use(authRoutes);
app.use(profileRoutes);
app.use(viewRoutes);
app.use('/api', tableRoutes);

app.use((req, res) => {
  res.status(404).send('Ruta no encontrada');
});

const wss = new WebSocketServer({ noServer: true });

const clients = new Set();

function broadcast(type, payload = {}) {
  const message = JSON.stringify({ type, payload, timestamp: Date.now() });

  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

app.locals.broadcast = broadcast;

server.on('upgrade', (request, socket, head) => {
  sessionParser(request, {}, () => {
    if (!request.session?.user) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });
});

wss.on('connection', (ws) => {
  clients.add(ws);

  ws.send(
    JSON.stringify({
      type: 'connected',
      payload: { message: 'WebSocket conectado' },
      timestamp: Date.now()
    })
  );

  ws.on('close', () => {
    clients.delete(ws);
  });
});

async function start() {
  try {
    await pool.query('SELECT 1');
    await ensureRegistrationSetup();
    const port = Number(process.env.PORT || 3000);

    server.listen(port, () => {
      console.log(`Servidor iniciado en http://localhost:${port}`);
    });
  } catch (error) {
    console.error('No se pudo conectar con MySQL:', error.message);
    process.exit(1);
  }
}

start();
