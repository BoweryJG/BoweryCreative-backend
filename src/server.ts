import express from 'express';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import dotenv from 'dotenv';
import { magicLinkRouter } from './routes/magic-link';
import { authRouter } from './routes/auth';
import { postRouter } from './routes/post';

dotenv.config();

const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(session({
  secret: process.env.SESSION_SECRET!,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// Routes
app.use('/magic', magicLinkRouter);
app.use('/auth', authRouter);
app.use('/api/posts', postRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'BoweryCreative Social Media Manager' });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`⚡ Lightning server running on port ${PORT}`);
});