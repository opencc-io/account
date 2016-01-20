var fs = require("fs");
var scrypt = require("scrypt");

var conf = JSON.parse(fs.readFileSync("conf.json"));

function DB(file) {
	this.file = file;
	this.scryptParams = scrypt.paramsSync(0.1);
	this.flushes = 0;

	try {
		this.obj = JSON.parse(fs.readFileSync(file));
	} catch (err) {
		if (err.code !== "ENOENT") throw err;
		this.obj = {
			users: {}
		};
		this.flush()
	}
}
DB.prototype = {
	flush: function(cb) {
		this.flushes += 1;
		fs.writeFile(this.file, JSON.stringify(this.obj, null, 4), function() {
			this.flushes -= 1;
			if (cb) cb();
		}.bind(this));
	},

	user_add: function(username, email, password, cb) {
		if (this.obj.users[username])
			throw new Error("Username already exists.");
		if (!/^[a-zA-Z0-9_\-]+$/.test(username))
			throw new Error("Username contains illegal characters.");

		this.obj.users[username] = true;
		scrypt.kdf(password, this.scryptParams, function(err, obj) {
			var user = {
				username: username,
				email: email,
				passhash: obj,
				computers: []
			}

			this.obj.users.push(user);
			this.flush();

			cb();
		}.bind(this));
	}
}

var db = new DB("db.json");

require("./app.js")(conf, db);
