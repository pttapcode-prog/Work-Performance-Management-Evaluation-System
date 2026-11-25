import dotenv from 'dotenv';
import app, { initApp } from './app.js';

dotenv.config();

const PORT = Number(process.env.PORT || 5000);

app.get('/', (_req, res) => {
  res.json({
    service: 'WPMES (Work Performance Management and Evaluation System) Backend API',
    status: 'running',
    docs: '/api/health',
  });
});

async function startServer() {
  await initApp();

  app.listen(PORT, () => {
    console.log(`[WPMES Backend] API Server listening on http://localhost:${PORT}`);
  });
}

startServer();
