const { MongoClient, ObjectId } = require('mongodb');	// require the mongodb driver

/**
 * Uses mongodb v3.6+ - [API Documentation](http://mongodb.github.io/node-mongodb-native/3.6/api/)
 * Database wraps a mongoDB connection to provide a higher-level abstraction layer
 * for manipulating the objects in our cpen322 app.
 */
function Database(mongoUrl, dbName){
	if (!(this instanceof Database)) return new Database(mongoUrl, dbName);
	this.connected = new Promise((resolve, reject) => {
		MongoClient.connect(
			mongoUrl,
			{
				useNewUrlParser: true
			},
			(err, client) => {
				if (err) reject(err);
				else {
					console.log('[MongoClient] Connected to ' + mongoUrl + '/' + dbName);
					resolve(client.db(dbName));
				}
			}
		)
	});
	this.status = () => this.connected.then(
		db => ({ error: null, url: mongoUrl, db: dbName }),
		err => ({ error: err })
	);
}

Database.prototype.getRooms = function(){
	return this.connected.then(db =>
		new Promise((resolve, reject) => {
			db.collection('chatrooms').find().toArray((err, rooms)=>{
				if(err){
					reject(err);
				}else{
					resolve(rooms);
				}
				
			});
		})
	)
}

Database.prototype.getRoom = function(room_id){
	return this.connected.then(db =>
		new Promise((resolve, reject) => {
			db.collection('chatrooms').find().toArray((err, rooms)=>{
				if(err){
					reject(err);
				}else{
					var room = null;
					for(var i = 0; i < rooms.length; i++){
						if(rooms[i]._id === room_id && typeof rooms[i]._id === ObjectId(String)){
							resolve(rooms[i])
						}else if (rooms[i]._id === room_id){
							room = rooms[i];
						}
					}
					resolve(room);
				}
			});
		})
	)
}

Database.prototype.addRoom = function(room){
	return this.connected.then(db => 
		new Promise((resolve, reject) => {
			if(room.name){
				var roomId = ObjectId();
				var newRoom = {
					_id: roomId,
					name: room.name,
					image: room.image
				};
				db.collection('chatrooms').insertOne(newRoom);
				resolve(newRoom);
			}else{
				reject(new Error('room name not provided'));
			}
			
		})
	)
}

Database.prototype.getLastConversation = function(room_id, before){
	return this.connected.then(db =>
		new Promise((resolve, reject) => {
			if(!before){
				before = Date.now();
			}
			db.collection('conversations').find({room_id: room_id}).sort({timestamp: -1}).toArray((err, conversation)=>{
				if(err){
					reject(err);
				}else if(conversation.length === 0){
					resolve(null);
				}else{
					for(var i = 0; i < conversation.length; i++){
						if(conversation[i].timestamp < before){
							resolve(conversation[i]);
						}
					}
					resolve(null);
				}
			});
		})
	)
}

Database.prototype.addConversation = function(conversation){
	return this.connected.then(db =>
		new Promise((resolve, reject) => {
			if(!conversation.room_id || !conversation.timestamp || !conversation.messages){
				reject(new Error('invalid conversation'));
			}
			conversation._id = ObjectId();
			db.collection('conversations').insertOne(conversation);
			resolve(conversation);
		})
	)
}

Database.prototype.getUser = function(username){
	return this.connected.then(db =>
		new Promise((resolve,reject)=>{
			db.collection('users').find({'username': username}).toArray((err, user)=>{
				if(err){
					reject(err);
				}else if(user.length === 0){
					resolve(null);
				}else{
					resolve(user[0]);
				}
			});
	}))
}


module.exports = Database;