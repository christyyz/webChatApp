const crypto = require('crypto');
const req = require('express/lib/request');

class SessionError extends Error {};

function SessionManager (){
	// default session length - you might want to
	// set this to something small during development
	const CookieMaxAgeMs = 600000;

	// keeping the session data inside a closure to keep them protected
	const sessions = {};

	// might be worth thinking about why we create these functions
	// as anonymous functions (per each instance) and not as prototype methods
	this.createSession = (response, username, maxAge = CookieMaxAgeMs) => {
		var token = crypto.randomBytes(16).toString('hex');
		var timestamp = Date.now();
        var obj = {	username: username,
					timestamp: timestamp,
					expire: timestamp+maxAge};
        sessions[token] = obj;
		// console.log(sessions);
        response.cookie('cpen322-session', token, {maxAge: maxAge});

		var dSession = ()=>{
			delete sessions[token];
		}

		setTimeout(dSession, maxAge);
	};

	this.deleteSession = (request) => {
		var token = Object.keys(sessions).find(key => sessions[key].username === request.username);
		delete sessions[token];
		delete request.username;
		delete request.session;
	};

	this.middleware = (request, response, next) => {
		var cookie = request.headers.cookie;
		var cookieName = 'cpen322-session';
		var cookieValue = '';
		// console.log(cookie);
		if(cookie){
			var cookies = cookie.split('; ');
			// console.log(cookies);
			for(var i = 0; i < cookies.length; i++){
				var pair = cookies[i].split('=');
				if(pair[0] === cookieName){
					cookieValue = pair[1];
					break;
				}
			}
			// console.log(cookieValue);
			// console.log(sessions);
			if(sessions[cookieValue]){
				request.username = sessions[cookieValue].username;
				request.session = cookieValue;
				next();
			}else{
				next(new SessionError('Session not found'));
				return;
			}
		}else{
			next(new SessionError('cookie not found'));
			return;
		}
	};

	// this function is used by the test script.
	// you can use it if you want.
	this.getUsername = (token) => ((token in sessions) ? sessions[token].username : null);
};

// SessionError class is available to other modules as "SessionManager.Error"
SessionManager.Error = SessionError;

module.exports = SessionManager;