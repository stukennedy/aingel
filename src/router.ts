
import { Hono, Env } from 'hono';

import * as api_auth_login from './routes/api/auth/login';
import * as api_auth_logout from './routes/api/auth/logout';
import * as api_auth_register from './routes/api/auth/register';
import * as login from './routes/login';
import * as onboarding from './routes/onboarding';
import * as register from './routes/register';
import * as index from './routes';

export const loadRoutes = <T extends Env>(app: Hono<T>) => {
	app.post('/api/auth/login', api_auth_login.onRequestPost);
	app.post('/api/auth/logout', api_auth_logout.onRequestPost);
	app.post('/api/auth/register', api_auth_register.onRequestPost);
	app.get('/login', login.onRequestGet);
	app.get('/onboarding', onboarding.onRequestGet);
	app.get('/register', register.onRequestGet);
	app.get('/', index.onRequestGet);
};