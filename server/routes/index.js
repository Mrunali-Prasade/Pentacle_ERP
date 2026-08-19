import express from 'express';
import apiRoutes from './api.routes.js';

const router = express.Router();

// Mount all API endpoints onto the router
router.use('/', apiRoutes);

export default router;
