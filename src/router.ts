
import { Hono, Env } from 'hono';

import * as api_anam_token from './routes/api/anam-token';
import * as api_auth_login from './routes/api/auth/login';
import * as api_auth_logout from './routes/api/auth/logout';
import * as api_auth_register from './routes/api/auth/register';
import * as api_session_form from './routes/api/session/form';
import * as api_session_submit from './routes/api/session/submit';
import * as api_session_debug from './routes/api/session/debug';
import * as api_session_ws from './routes/api/session/ws';
import * as api_session_id from './routes/api/session/[id]';
import * as login from './routes/login';
import * as onboarding from './routes/onboarding';
import * as register from './routes/register';
import * as index from './routes';

export const loadRoutes = <T extends Env>(app: Hono<T>) => {
	app.post('/api/anam-token', api_anam_token.onRequestPost);
	app.post('/api/auth/login', api_auth_login.onRequestPost);
	app.post('/api/auth/logout', api_auth_logout.onRequestPost);
	app.post('/api/auth/register', api_auth_register.onRequestPost);
	app.post('/api/session/form', api_session_form.onRequestPost);
	app.post('/api/session/submit', api_session_submit.onRequestPost);
	app.post('/api/session/debug', api_session_debug.onRequestPost);
	app.get('/api/session/ws', api_session_ws.onRequestGet);
	app.get('/api/session/:id', api_session_id.onRequestGet);
	app.get('/login', login.onRequestGet);
	app.get('/onboarding', onboarding.onRequestGet);
	app.get('/register', register.onRequestGet);
	app.get('/', index.onRequestGet);
};
