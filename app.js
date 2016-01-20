var http = require("http");
var crypto = require("crypto");
var email = require("emailjs/email");
var fs = require("fs");

function randomKey(n) {
	return crypto.randomBytes(n || 32).toString("hex");
}

var emails = {};
[
	"confirm"
].forEach(function(mail) {
	var plain = fs.readFileSync("emails/"+mail+".txt", "utf8");
	var html = fs.readFileSync("emails/"+mail+".html", "utf8");
	emails[mail] = function(options, cb) {
		args = options.args || {};

		var p = plain;
		for (var i in args) {
			p = p.split("{{"+i+"}}").join(args[i]);
		}

		var h = html;
		for (var i in args) {
			h = h.split("{{"+i+"}}").join(args[i]);
		}

		var opts = {
			text: p,
			from: options.ctx.conf.mail.from,
			to: options.to,
			subject: options.subject,
			attachment: [
				{data: h, alternative: true}
			]
		};

		options.ctx.mail.send(opts, cb);
	}
});

var state = {
	confirmationEmails: {}
}

var routes = {
	user_add_args: {
		username: "string",
		email: "string",
		password: "string"
	},
	user_add: function(args, res, isSuperuser, ctx) {
		var key = randomKey();
		state.confirmationEmails[args.email] = key;

		var options = {
			ctx: ctx,
			to: args.email,
			subject: "Confirmation Email",
			args: {
				host: ctx.conf.host,
				key: key,
				logo: ctx.conf.logo
			}
		};

		emails.confirm(options, function(err, message) {
			if (err) return res.error(err);
			console.log(message);
			res.json();
		});
	}
};

module.exports = function(conf, db) {
	var ctx = {
		conf: conf,
		db: db,
		mail: email.server.connect({
			user: conf.mail.user,
			password: conf.mail.password,
			host: conf.mail.host,
			ssl: conf.mail.ssl
		})
	}

	var server = http.createServer(function(req, res) {
		res.json = function(obj, failure, code) {
			obj = obj || {};
			if (!failure) {
				obj.success = true;
			}
			res.writeHead(code || 200);
			res.end(JSON.stringify(obj));
		}
		res.error = function(err, code) {
			console.trace(err);
			res.json({error: err.toString()}, true, code || 400);
		}

		var str = "";
		req.on("data", function(data) {
			str += data;
		});
		req.on("end", function() {
			var obj;
			try {
				obj = JSON.parse(str);
			} catch (err) {
				return res.error("Invalid JSON");
			}

			var name = req.url.substring(1).split("/")[0];
			var route = routes[name];
			var args = routes[name+"_args"];

			if (!route || !args)
				return res.error("404", 404);

			var missing = [];
			for (var i in args) {
				var type = args[i];
				if (typeof obj[i] !== typeof args[i]) {
					missing.push(type+" "+i);
				}
			}

			console.log("Request from "+req.connection.remoteAddress);
			var isSuperuser;
			if (obj.key && obj.key === conf.superusers[req.connection.remoteAddress]) {
				isSuperuser = true;
			} else {
				isSuperuser = false;
			}
			delete obj.key;

			if (missing.length !== 0) {
				res.error("Missing arguments: "+missing.join(", "));
			} else {
				route(obj, res, isSuperuser, ctx);
			}
		});
	});
	server.listen(conf.port, "127.0.0.1");
}
