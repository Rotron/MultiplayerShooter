var mongojs = require('mongojs');
var db = mongojs('localhost:27017/GameTurtorial', ['account', 'progress']);

var express = require('express');
var app = express();
var serv = require('http').Server(app);

app.get('/', function(req, res) {
    res.sendFile(__dirname + '/client/index.html');
})

app.use('/client', express.static(__dirname + '/client'));

serv.listen(2000);
console.log("Server started.");


var SOCKET_LIST = {};

var Entity = function() {
    var self = {
        x: 250,
        y: 250,
        spdX: 0,
        spdY: 0,
        id: ''
    };
    self.update = function() {
        self.updatePosition();
    }

    self.updatePosition = function() {
        self.x += self.spdX;
        self.y += self.spdY;
    }

    self.getDistance = function(pt) {
        return Math.sqrt(Math.pow(self.x-pt.x,2) + Math.pow(self.y-pt.y,2));
    }
    return self;
}

var Player = function(id) {
    var self = Entity();
    self.id = id;
    self.number = "" + Math.floor(10 * Math.random());
    self.pressingRight = false;
    self.pressingLeft = false;
    self.pressingUp = false;
    self.pressingDown = false;
    self.pressingAtk = false;
    self.mouseAngle = 0;
    self.maxSpd = 10;
    self.hp = 10;
    self.hpMax = 10;
    self.score = 0;

    var super_update = self.update;
    self.update = function() {
        self.updateSpd();
        super_update();

        if (self.pressingAtk) 
            //for (var i = -3; i < 3; i++)
            self.shootBullet(self.mouseAngle);
        
    }
    self.shootBullet = function(angle) {
        var b = Bullet(self.id, angle);
        b.x = self.x;
        b.y = self.y;
    }

    self.updateSpd = function() {
        if(self.pressingRight)
            self.spdX = self.maxSpd;
        else if(self.pressingLeft)
            self.spdX = -self.maxSpd;
        else self.spdX = 0

        if(self.pressingUp)
            self.spdY = -self.maxSpd;
        else if(self.pressingDown)
            self.spdY = self.maxSpd;
        else self.spdY = 0;
    }

    self.getInitPack = function() {
        return {
            id: self.id,
            x: self.x,
            y: self.y,
            number: self.number,
            hp: self.hp,
            hpMax: self.hpMax,
            score: self.score
        };
    }
    self.getUpdatePack = function() {
        return {
            id: self.id,
            x: self.x,
            y: self.y,
            hp: self.hp,
            score: self.score
        }
    }
    Player.list[id] = self;
    initPack.player.push(self.getInitPack());
    return self;
}
Player.list = {};
Player.onConnect = function(socket) {
    var player = Player(socket.id);
    socket.on('keyPress', function(data) {
        if (data.inputId === 'left')
            player.pressingLeft = data.state;
        else if (data.inputId === 'up')
            player.pressingUp = data.state;
        else if (data.inputId === 'right')
            player.pressingRight = data.state;
        else if (data.inputId === 'down')
            player.pressingDown = data.state;
        else if (data.inputId === 'attack')
            player.pressingAtk = data.state;
        else if (data.inputId === 'mouseAngle')
            player.mouseAngle = data.state;
    });
    socket.emit('init', {
        selfId: socket.id,
        player: Player.getAllInitPack(),
        bullet: Bullet.getAllInitPack()    
    });
}

Player.getAllInitPack = function() {
    var player = [];
    for (var i in Player.list)
        player.push(Player.list[i].getInitPack());
    return player;
}

Player.onDisconnect = function(socket) {
    delete Player.list[socket.id];
    removePack.player.push(socket .id);
}

Player.update = function() {
    var pack = [];
    for (var i in Player.list) {
        var player = Player.list[i];
        player.update();
        pack.push(player.getUpdatePack());
    }
    return pack;
}

var Bullet = function(parent, angle) {
    var self = Entity();
    self.id = Math.random();
    self.parent = parent;
    self.spdX = Math.cos(angle/180*Math.PI) * 10;
    self.spdY = Math.sin(angle/180*Math.PI) * 10;

    self.timer = 0;
    self.toRemove = false;
    var super_update = self.update;
    self.update = function() {
        if (self.timer++ > 100)
            self.toRemove = true;
        if (!self.toRemove)
            super_update();
        for (var i in Player.list) {
            var p = Player.list[i];
            if (self.parent !== p.id && self.getDistance(p) < 20) {
                p.hp -= 1;
                if (p.hp <= 0) {
                    var shooter = Player.list[self.parent];
                    if(shooter)
                        shooter.score += 1;
                    p.hp = p.hpMax;
                    p.x = Math.random() * 500;
                    p.y = Math.random() * 500;
                }
                self.toRemove = true;
                // handle collusion. ex: hp--;
            }
        }
    }
    self.getInitPack = function() {
        return {
            id: self.id,
            x: self.x,
            y: self.y
        };
    }
    self.getUpdatePack = function() {
        return {
            id: self.id,
            x: self.x,
            y: self.y
        }
    }
    Bullet.list[self.id] = self;
    initPack.bullet.push(self.getInitPack());
    return self;
}
Bullet.list = {};
Bullet.update = function() {
    var pack = [];
    for (var i in Bullet.list) {
        var bullet = Bullet.list[i];
        bullet.update();
        if (bullet.toRemove){
            delete Bullet.list[i];
            removePack.bullet.push(bullet.id);
        } else
            pack.push(bullet.getUpdatePack());
    }
    return pack;
}
Bullet.getAllInitPack = function() {
    var bullet = [];
    for (var i in Bullet.list)
        bullet.push(Bullet.list[i].getInitPack());
    return bullet;
}

var DEBUG = true;

var isValidPassword = function(data, cb) {
    db.account.find({username: data.username,password: data.password}, function(err, res) {
        if (res[0]) 
            cb(true);
        else cb(false);
    });
}
var isUsernameTaken = function(data, cb) {
    db.account.find({username: data.username}, function(err, res) {
        if (res[0]) 
            cb(true);
        else cb(false);
    });
}
var addUser = function(data, cb) {
    db.account.insert({username:data.username,password:data.password}, function(err) {
        cb();
    });
}
var io = require('socket.io')(serv, {});
io.sockets.on('connection', function(socket) {
    socket.id = Math.random();    
    SOCKET_LIST[socket.id] = socket;

    socket.on('signIn', function(data) {
        isValidPassword(data, function(res) {
            if (res) {
                Player.onConnect(socket);
                socket.emit('signInResponse', {success:true});
            } else 
                socket.emit('signInResponse', {success:false});
        });
    });
    socket.on('signUp', function(data) {
        isUsernameTaken(data, function(res) {
            if (res)
                socket.emit('signUpResponse', {success:false});
            else {
                addUser(data, function() {
                    socket.emit('signUpResponse', {success:true});
                });
            }
        })
    });

    var size = Object.keys(SOCKET_LIST).length;
    console.log(size + " sockets connected");
    socket.on('disconnect', function() {
        delete SOCKET_LIST[socket.id];
        Player.onDisconnect(socket);
        console.log("socket disconnected");
    });

    socket.on('sendMsgToServer', function(data) {
        var playerName = ("" + socket.id).slice(2, 7);
        for (var i in SOCKET_LIST) {
            SOCKET_LIST[i].emit('addToChat', playerName + ': ' + data);
        }
    });
    socket.on('evalServer', function(data) {
        if (!DEBUG) return;
        var res = eval(data);
        socket.emit('evalAnswer', res);
    });
});

var initPack = {player: [], bullet: []};
var removePack = {player: [], bullet: []};

setInterval(function() {
    var pack = {
        player: Player.update(),
        bullet: Bullet.update()
    }
    
    for (var i in SOCKET_LIST) {
        var socket = SOCKET_LIST[i];
        socket.emit('init', initPack);
        socket.emit('update', pack);
        socket.emit('remove', removePack);
    }

    initPack.player = [];
    initPack.bullet = [];
    removePack.player = [];
    removePack.player = [];
}, 1000/25);
