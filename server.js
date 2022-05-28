const path = require('path');
const fs = require('fs');
const express = require('express');
const ws = require('ws');
const Database = require('./Database.js');
const SessionManager = require('./SessionManager.js');
const crypto = require('crypto');

function logRequest(req, res, next){
    console.log(`${new Date()}  ${req.ip} : ${req.method} ${req.path}`);
    next();
}

const host = 'localhost';
const port = 3000;
const clientApp = path.join(__dirname, 'client');

// express app
let app = express();

app.use(express.json())                         // to parse application/json
app.use(express.urlencoded({ extended: true })) // to parse application/x-www-form-urlencoded
app.use(logRequest);                            // logging for debug


///////////////////////////////////////////
var mongoUrl = 'mongodb://localhost:27017';
var dbName = 'cpen322-messenger';
var db = new Database(mongoUrl, dbName);

var messages = {};
db.getRooms().then((rooms)=>{
    for(var i = 0; i < rooms.length; i++){
        messages[rooms[i]._id] = [];
    }    
});

// number of messages to include in a conversation
var messageBlockSize = 1;

var sessionManager = new SessionManager();

var isCorrectPassword = (password, saltedHash)=>{
    var savedSalt = saltedHash.substring(0,20);
    var savedHash = saltedHash.substring(20);
    return savedHash === crypto.createHash('sha256').update(password+savedSalt).digest('base64');
}

app.use('/chat/:room_id/messages', sessionManager.middleware);
app.use('/chat/:room_id', sessionManager.middleware);
app.use('/chat', sessionManager.middleware);
app.use('/profile', sessionManager.middleware);
app.use('/app.js', sessionManager.middleware, express.static(clientApp + '/app.js'));
app.use('/index.html', sessionManager.middleware, express.static(clientApp + '/index.html'));
app.use('/index', sessionManager.middleware, express.static(clientApp + '/index.html'));
app.use('/+', sessionManager.middleware, express.static(clientApp + '/index.html'));

app.route('/chat/:room_id/messages').get(function(req,res,next){
    db.getLastConversation(req.params.room_id, req.query.before).then((conversation)=>{
        if(conversation === null){
            res.status(400);
            res.send('Reached the end of conversation');
        }else{
            res.status(200).send(JSON.stringify(conversation));
        }
    })
})

app.route('/chat/:room_id').get(function(req, res, next){
    db.getRoom(req.params.room_id).then((room)=>{
        if(result === null){
            res.status(400);
            res.send('Room not found');
        }else{
            res.status(200);
            res.send(JSON.stringify(room));
        }
    })
})

app.route('/chat').get(function (req, res, next) {
    db.getRooms().then((chatrooms)=>{
        var array = [];
        for(var i = 0; i < chatrooms.length; i++){
            var obj = {_id: chatrooms[i]._id, name: chatrooms[i].name, 
                image: chatrooms[i].image, messages: messages[chatrooms[i]._id]};
            array.push(obj);
        }
        res.status(200);
        res.send(JSON.stringify(array));
    });
  }).post(function (req, res, next){
    if(!req.body.hasOwnProperty('name')){
        res.status(400);
        res.send(new Error('Error: no name property'));
    }else{
        var obj = {name: req.body.name, image: req.body.image};
        db.addRoom(obj).then((room)=>{
        messages[room._id] = [];
        res.status(200);
        res.send(JSON.stringify(room));
        });
    }
  })

  app.route('/profile').get(function(req, res, next){
    res.status(200).send(JSON.stringify({username: req.username}));
})

app.route('/logout').get(function(req, res, next){
    sessionManager.deleteSession(req);
    res.redirect('/login');
})

app.route('/login').post(function(req, res, next){
    db.getUser(req.body.username).then((user)=>{
        if(user === null){
            res.redirect('/login');
        }else{
            if(isCorrectPassword(req.body.password,user.password)){
                sessionManager.createSession(res, user.username)
                res.redirect('/');
            }else{
                res.redirect('/login');
            }
        }
    })
})

var broker = new ws.Server({port: 8000});
broker.on('connection', (curClient, req)=>{
    var cookie = req.headers.cookie;
		var cookieName = 'cpen322-session';
		var cookieValue = '';
		if(cookie){
			var cookies = cookie.split('; ');
			for(var i = 0; i < cookies.length; i++){
				var pair = cookies[i].split('=');
				if(pair[0] === cookieName){
					cookieValue = pair[1];
					break;
				}
			}
            var username = sessionManager.getUsername(cookieValue);
			if(username){
                curClient.on('message', (message)=>{
                    var msg = JSON.parse(message);
                    if(msg.text.includes('<script>')){
                        return;
                    }
                    msg.username = username;
                    if(!messages[msg.roomId]){
                        messages[msg.roomId] = [];
                    }
                    messages[msg.roomId].push({username: msg.username, text: msg.text});
                    for(var client in broker.clients){
                        if(broker.clients[client] !== curClient){
                            broker.clients[client].send(JSON.stringify(msg));
                        }
                    }
                    if(messages[msg.roomId].length === messageBlockSize){
                        var conversation = {
                            room_id: msg.roomId,
                            timestamp: Date.now(),
                            messages: messages[msg.roomId]
                        };
                        db.addConversation(conversation);
                        messages[msg.roomId] = [];
                    }
                })
			}else{
				curClient.close();
			}
		}else{
			curClient.close();
		}
});



////////////////////////////////////////


// serve static files (client-side)
app.use('/', express.static(clientApp, { extensions: ['html'] }));
app.listen(port, () => {
    console.log(`${new Date()}  App Started. Listening on ${host}:${port}, serving ${clientApp}`);
}); 

app.use((err, req, res, next) => {
    if(err instanceof SessionManager.Error){
        if(req.header.Accept === 'application/json'){
            res.status(401).send(err);
            return;
        }else{
            res.redirect('/login');
        }
    }
    console.error(err.stack)
    res.status(500).send('Something broke!')
  })
