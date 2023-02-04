var util = require('util');

module.exports = function(app,io) {
	var googl = require('goo.gl');
	var htmlspecialchars = require('htmlspecialchars'); //htmlspecialchars для nodejs ) 
	var rooms = []; //rooms: {id, title, maxcount, admin}	
	var max_nick_length = 16;
	var max_users_count = 20;

	googl.setKey("AIzaSyDOsA6riTLxMmQsXrynyk-S0tZa8IBL6X0");

	app.get('/', function(req, res) {
		res.render('intro'); //печать главной странички :)
	});

	app.get("/stats", function(req, res) {
		//запилить потом какую-нибудь статусную страничку простую.
		usersCount = getClientsByRoom("").length;
		body =  "Current users connected: " + usersCount + "<br />";
		body += "Rooms count: " + rooms.length + "<br />";
		body += "Mem Usage: " + util.inspect(process.memoryUsage());
		res.send(body);
	});

	app.get('/create', function(req, res) { 
		//при переходе сюда нужно сгенерировать уникальный ID и перенаправить туда
		var id = Math.round((Math.random() * 1000000));
		res.redirect('/room/' + id);
	});


	app.get('/room/:id', function(req, res) {
		//страничка чата.
		res.render('chat');
	});


	var chatAPP = io.on('connection', function(client) {

		client.on('disconnect', function() {
			client.broadcast.to(this.roomID).emit("part", {"nick": this.nick, "reason": "user disconnected"});
			client.leave(this.roomID);
			destroyRoomOnEmpty(client.roomID); //проверить, если комната пустая, то удалить её нафиг!
		});

		client.on('initme', function(data) {
			if (isRoomFull(data.roomID)) {
				client.emit('room_is_full', {roomID: data.roomID});
				return false;
			}
			
			if (isRoomEmpty(data.roomID)) {
				client.emit("auth_request", {"admin": true});
			} else {
				client.emit("auth_request", {"admin": false});
			}
		});

		client.on("echo", function(data) {
			client.emit("echo", {text: data.text});
		});

		client.on("login", function(data) {
			client.nick = data.nick;
			client.roomID = data.roomID;

			if (isRoomFull(data.roomID)) {
				client.emit('room_is_full', {roomID: data.roomID});
				return false;
			}

			if ((data.nick.length < 2) || (data.nick.length > max_nick_length)) {
				client.emit('login_error', {text: "Ник должен быть длинной от 2 до "+max_nick_length+" символов."});
				return false;
			}

			if (!checkUserNick(data.nick)) {
				client.emit('login_error', {text: "Ник содержит запрещённые символы"});
				return false;
			}

			if (userExistsInRoom(data.roomID, data.nick)) {
				client.emit('user_exists');
				return false;
			}

			var isAdmin = false;

			if (isRoomEmpty(data.roomID)) { //кто первый зашёл, тот и админ :)
				isAdmin = true;
			} else {
				client.broadcast.to(data.roomID).emit("join", {"nick": data.nick});	
			}

			if (isAdmin) {
				if (!isValidUsersCount(data.usersCount)) {
					client.emit('login_error', {text: "неверно указано количество человек для чата."});
					return false;
				}
				addRoom(data.roomID, data.nick, data.usersCount);
			}

			client.join(data.roomID);
			client.emit("start_chat");

			if (isAdmin) {
				googl.shorten('chat.shpirat.net:88/room/' + data.roomID)
				.then(function(shortURL) {
					client.emit('set_invite_link', {link: shortURL});
				})
				.catch(function (err) {
        			console.error("Goo.gl error: " + err.message);
    			});
    		}
		});

		client.on("get_user_list", function(data) {
			if (data.roomID != client.roomID) { //если кто-то захочет получить список пользователей другой комнаты, то послать его
				client.emit("error", {"text": "Fuck you, hacker!!"});
				return false;
			}
			client.emit('set_user_list', {userList: getUserListByRoom(data.roomID)});
		});

		client.on("typing_notify", function(data) {
			client.broadcast.to(client.roomID).emit('typing_notify', {"nick": client.nick, "typing": data.typing});
		});

		client.on("message", function(data) {
			if (data.text.trim().length) {
				//защитимся! html теги в сообщении - зло!... ) 
				text = htmlspecialchars(data.text);
				text = replaceBBAndSmileys(text);

				chatAPP.in(client.roomID).emit("message", {"text": text, "from": client.nick});
			}
		});

		client.on('part', function(data) {
			client.broadcast.to(client.roomID).emit('part', {"nick": client.nick});
			client.leave(client.roomID);
			destroyRoomOnEmpty(client.roomID);
			client.emit('end_chat', {"reason": "You self disconnected"});
		});

		/* вспомогательные функции */

		function addRoom(roomID, roomAdmin, maxCount) {
			room = new Object();
			room.id = roomID;
			room.title = "";
			room.maxcount = maxCount;
			room.admin = roomAdmin;
			
			rooms.push(room);
		}

		function removeRoom(roomID) {
			for (i=0; i<rooms.length; i++) {
				room = rooms[i];
				if (room.id == roomID) {
					rooms.splice(i);
				}
			}
		}

		function destroyRoomOnEmpty(roomID) {
			for (i=0; i<rooms.length; i++) {
				room = rooms[i];
				if (room.id == roomID) {
					rooms.splice(i);
					return true;
				}
			}
			return false;
		}

		function isRoomFull(roomID) {
			room = getRoomByID(roomID);
			if (!room) {
				return false;
			}
			users = getClientsByRoom(roomID);
			//console.log("isRoomFull. Max: " + room.maxcount + '; currentCount: ' + users.length);
			return (room.maxcount == users.length);
		}

		function getRoomByID(roomID) {
			for (i=0; i<rooms.length; i++) {
				room = rooms[i];
				if (room.id == roomID) {
					return room;
				}
			}
			return null;
		}

		function isRoomEmpty(roomID) {
			return (getClientsByRoom(roomID).length == 0);
		}

		function roomExists(roomID) {
			return (getRoomByID(roomID) != null);
		}

		function isValidUsersCount(count) {
			return ((count >=2) && (count <= max_users_count));
		}

		function checkUserNick(nick) {
			var reg = /^[a-zа-я0-9_-]{2,16}$/i;
			return (reg.test(nick));
		}

		function userExistsInRoom(roomID, nick) {
			nick = nick.toLowerCase();
			userList = getClientsByRoom(roomID);
			for (i=0; i<userList.length; i++) {
				user = userList[i];
				if (user.nick.toLowerCase() == nick) {
					return true; //User exists! Уиии!!
				}
			}
			return false;
		}

		function isUserIsAdmin(roomID, nick) {
			room = getRoomByID(roomID);
			nick = nick.toLowerCase();
			return (nick == room.admin.toLowerCase());
		}

		function getUserListByRoom(roomID) {
			var res = [];
			uList = getClientsByRoom(roomID);
			for (i=0; i<uList.length; i++) {
				user = uList[i];
				if (!user.nick) 
					continue;
				res.push({"nick": user.nick, "isAdmin": false});
			}
			return res;
		}

		function findClientsSocket(roomId, namespace) {
			return getClientsByRoom(roomId, namespace);
		}

		function str_replace(search, replace, subject) {
  			return subject.split(search).join(replace);
		} 

		function replaceBBAndSmileys(text) {
			function r(from, to) { //для замены BB-кодов небольших.
				reg = new RegExp('\\[' + from + '\\]','gi')
				text = text.replace(reg, to);
			}

			r('b', '<strong>');
			r('/b', '</strong>');
			r('i', '<i>');
			r('/i', '</i>');
			r('u', '<u>');
			r('/u', '</u>');
			r('s', '<strike>');
			r('/s', '</strike>');
			r('pre', '<pre>');
			r('/pre', '</pre>');
			//
			return text;
		}

	}); //end of chatAPP...

		function getClientsByRoom(roomId) {
			var res = [],
				ns = io.of("/");
			if (ns) {
				for (var id in ns.connected) {
					if(roomId) {
						var index = ns.connected[id].rooms.indexOf(roomId) ;
						if(index !== -1) {
							res.push(ns.connected[id]);
						}
					} else {
						res.push(ns.connected[id]);
					}
				}
			}
			return res;
		}
}; //end of module.exports=...
