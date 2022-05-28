function main(){
    var lobby = new Lobby();
    var lobbyView = new LobbyView(lobby);
    var socket = new WebSocket('ws://localhost:8000');
    var chatView = new ChatView(socket);
    var profileView = new ProfileView();
    
    var renderRoute = function(){
        var url = window.location.hash;
        var elements = url.split('/');
        emptyDOM (document.getElementById('page-view'));
        if (url == '' || elements[1] == ''){
            document.getElementById('page-view').appendChild(lobbyView.elem);
        }else if (elements[1] == "profile"){
            document.getElementById('page-view').appendChild(profileView.elem);
        }else{
            var roomId = elements[1].substring(4);
            var chatRoom = lobby.getRoom(roomId);
            chatView.setRoom(chatRoom);
            document.getElementById('page-view').appendChild(chatView.elem);
        }
    };

    var refreshLobby = function(){
        Service.getAllRooms().then((rooms)=>{
            for(var key in rooms){
                if(rooms[key]._id in lobby.rooms){
                    lobby.rooms[rooms[key]._id].name = rooms[key].name;
                    lobby.rooms[rooms[key]._id].image = rooms[key].image;
                    lobby.rooms[rooms[key]._id].messages = rooms[key].messages;
                }else{
                    lobby.addRoom(rooms[key]._id, rooms[key].name, rooms[key].image, rooms[key].messages);
                }
            }
        });
    };

    Service.getProfile().then((obj)=>{
        profile.username = obj.username;
    })

    refreshLobby();
    window.addEventListener("popstate", renderRoute);
    renderRoute();
    setInterval(refreshLobby, 6000);

        
    socket.addEventListener('message', (message)=>{
        var data = JSON.parse(message.data);
        if(data.text.include('<script>')){
            alert('Illegal Message');
        }else{
            var room = lobby.getRoom(data.roomId);
            room.addMessage(data.username, data.text);
        }
        
    });

}

var profile = {};

var Service = { origin : window.location.origin,
                getAllRooms : ()=>
                    new Promise((resolve, reject)=>{
                        var xhr = new XMLHttpRequest();
                        xhr.open("GET", Service.origin+"/chat");
                        xhr.onload = ()=>{
                            if(xhr.status === 200){
                                resolve(JSON.parse(xhr.responseText));
                            }else{
                                reject(new Error(xhr.responseText));
                            }
                        };
                        xhr.onerror = (err)=>{
                            reject(err);
                        }
                        xhr.send();
                    }),
                addRoom : (data)=>
                    new Promise((resolve, reject)=>{
                        var xhr = new XMLHttpRequest();
                        xhr.open('POST', Service.origin+'/chat');
                        xhr.setRequestHeader('Content-Type', 'application/json');
                        xhr.onload = ()=>{
                            if(xhr.status === 200){
                                resolve(JSON.parse(xhr.responseText));
                            }else{
                               reject(new Error(xhr.responseText));
                            }
                        }
                        xhr.onerror = (err)=>{reject(err);}
                        xhr.send(JSON.stringify(data));
                    }),
                getLastConversation: (roomId, before)=>
                    new Promise((resolve, reject)=>{
                        var xhr = new XMLHttpRequest();
                        xhr.open('GET', Service.origin+'/chat/'+roomId+'/messages?before='+before);
                        xhr.onload = ()=>{
                            if(xhr.status === 200){
                                resolve(JSON.parse(xhr.responseText));
                            }else{
                                reject(new Error(xhr.responseText));
                            }
                        }
                        xhr.onerror = (err)=>{reject(err)};
                        xhr.send();
                    }),
                getProfile: ()=>
                    new Promise((resolve, reject)=>{
                        var xhr = new XMLHttpRequest();
                        xhr.open('GET',Service.origin+'/profile');
                        xhr.onload = ()=>{
                            if(xhr.status === 200){
                                resolve(JSON.parse(xhr.responseText));
                            }else{
                                reject(new Error(xhr.responseText));
                            }
                        }
                        xhr.onerror = (err)=>{reject(err);}
                        xhr.send();
                    })
            };

window.addEventListener('load', main);

class LobbyView{
    constructor(lobby){
        this.lobby = lobby;
        this.elem = createDOM(`
        <div class = content>
            <!-- List of Rooms -->
            <ul class = room-list>
            </ul>
            <!-- Page Controls -->
            <div class = page-control>
              <input type = text placeholder="Room Title">
              <button>Create Room</button>
            </div>
        </div>`);
        this.listElem = this.elem.querySelector('ul.room-list');
        this.inputElem = this.elem.querySelector('input');
        this.buttonElem = this.elem.querySelector('button');
        this.lobby.onNewRoom = (room)=>{
            this.listElem.appendChild(createDOM(`
            <li class = menu-item><a href = '#/chat`+room.id+`'>`+room.name+`</a></li>
            `));
        };
        this.redrawList();
        this.buttonClick = function(){
            var roomName = this.inputElem.value;
            this.inputElem.value = '';
            Service.addRoom({name: roomName, image: 'assets/everyone-icon.png'}).then((room)=>{
                lobby.addRoom(room._id, room.name, room.image, room.messages);
            })
        };
        this.buttonElem.addEventListener('click',this.buttonClick.bind(this), false);
    }
    redrawList(){
        emptyDOM(this.listElem);
        for(var key in this.lobby.rooms){
            this.listElem.appendChild(createDOM(`
            <li class = menu-item><a href = '#/chat'`+this.lobby.rooms[key].id+`>`+this.lobby.rooms[key].name+`</a></li>
            `));
        }
    }
}

class ChatView{
    constructor(socket){
        this.socket = socket;
        this.elem = createDOM(`
        <div class = content>
          <h4 class = room-name>Room Name Heading</h4>
          <!-- Messages -->
          <div class = message-list>
          </div>
          <!-- Page Control -->
          <div class = page-control>
            <textarea></textarea>
            <button>Send</button>
          </div>
        </div>`);
        this.titleElem = this.elem.querySelector('h4');
        this.chatElem = this.elem.querySelector('div.message-list');
        this.inputElem = this.elem.querySelector('textarea');
        this.buttonElem = this.elem.querySelector('button');
        this.room = null;
        this.buttonElem.addEventListener('click', ()=>{this.sendMessage();});
        this.inputElem.addEventListener('keyup', (event)=>{
            if(event.keyCode === 13 && !event.shiftKey){
                this.sendMessage();
            }
        });
        this.chatElem.addEventListener('wheel', (event)=>{
            if(this.chatElem.scrollTop === 0 && event.deltaY < 0 && this.room.canLoadConversation){
                this.room.getLastConversation.next();
            }
        })
    }
    sendMessage(){
        var text = this.inputElem.value;
        this.room.addMessage(profile.username, text);
        this.inputElem.value = '';
        var obj = {roomId: this.room.id, username: profile.username, text: text};
        this.socket.send(JSON.stringify(obj));
    }
    setRoom(room){
        this.room = room;
        this.titleElem.innerHTML = room.name;
        emptyDOM(this.chatElem);
        for(var key in this.room.messages){
            this.room.onNewMessage(this.room.messages[key]);
        }
        this.room.getLastConversation.next();
        room.onNewMessage = (message)=>{
            if(message.username === profile.username){
                var newMsg = createDOM(`
                <div class = my-message>
                    <span class = message-user>`+message.username+`</span>
                    <span class = message-text>`+message.text+`</span>
                </div>`);
            }
            else{
                var newMsg = createDOM(`
                <div class = message>
                    <span class = message-user>`+message.username+`</span>
                    <span class = message-text>`+message.text+`</span>
                </div>`);
            }
            this.chatElem.appendChild(newMsg);
        };
        room.onFetchConversation = (conversation)=>{
            var hb = this.chatElem.scrollHeight;
            var ha = this.chatElem.scrollHeight;
            for(var i = conversation.messages.length-1; i >= 0; i--){
                if(conversation.messages[i].username === profile.username){
                    var newMsg = createDOM(`
                    <div class = my-message>
                        <span class = message-user>`+conversation.messages[i].username+`</span>
                        <span class = message-text>`+conversation.messages[i].text+`</span>
                    </div>`);
                }else{
                    var newMsg = createDOM(`
                    <div class = message>
                        <span class = message-user>`+conversation.messages[i].username+`</span>
                        <span class = message-text>`+conversation.messages[i].text+`</span>
                    </div>`);
                }
                this.chatElem.prepend(newMsg);
                ha = this.chatElem.scrollHeight;
                this.chatElem.scrollTop = ha - hb;
                hb = ha;
            }
        };
    }
}

class ProfileView{
    constructor(){
        this.elem = createDOM(`
        <div class = content>
          <!-- Profile Form -->
          <div class = profile-form>
            <div class = form-field>
              <label>Username</label>
              <input type = text>
            </div>
            <div class = form-field>
              <label>Password</label>
              <input type = password>
            </div>
            <div class = form-field>
              <label>Avatar Image</label>
              <input type = file>
            </div>
            <div class = form-field>
              <label>About</label>
              <input type = text>
            </div>
          </div>
          <!-- Page Control -->
          <div class = page-control>
            <button>Save</button>
          </div>
          <!-- Sign out button -->
          <form method="GET", action="/logout">
            <button>Sign out</button>
          </form>
        </div>`);
    }
}

class Room{
    constructor(id, name, image = 'assets/everyone-icon.png', messages = []){
        this.id = id;
        this.name = name;
        this.image = image;
        this.messages = messages;
        this.canLoadConversation = true;
        this.getLastConversation = makeConversationLoader(this);
    }
    addMessage(username, text){
        if(text.split(' ').join('') == '')  return;
        var msg = {username: username, text: text};
        this.messages.push(msg);
        if(typeof this.onNewMessage === "function"){
            this.onNewMessage(msg);
        }
    }
    addConversation(conversation){
        for(var i = 0; i < conversation.messages.length; i++){
            this.messages.push(conversation.messages[i]);
        }
        if(typeof this.onFetchConversation === "function"){
            this.onFetchConversation(conversation);
        }
    }
}

function* makeConversationLoader(room){
    var lastTimeStamp = Date.now();
    while(room.canLoadConversation){
        room.canLoadConversation = false;
        yield Service.getLastConversation(room.id, lastTimeStamp).then((conversation)=>{
            if(conversation){
                room.canLoadConversation = true;
                lastTimeStamp = conversation.timestamp;
                room.addConversation(conversation);
            }
            resolve(conversation);
        });
    }
}



class Lobby{
    constructor(){
        this.rooms = {};
    }
    getRoom(roomId){
        return this.rooms[roomId];
    }
    addRoom(id, name, image, messages){
        var nRoom = new Room(id, name, image, messages);
        this.rooms[id] = nRoom;
        if(typeof this.onNewRoom === "function"){
            this.onNewRoom(nRoom);
        }
    }
}


// Removes the contents of the given DOM element (equivalent to elem.innerHTML = '' but faster)
function emptyDOM (elem){
    while (elem.firstChild) elem.removeChild(elem.firstChild);
}

// Creates a DOM element from the given HTML string
function createDOM (htmlString){
    let template = document.createElement('template');
    template.innerHTML = htmlString.trim();
    return template.content.firstChild;
}
