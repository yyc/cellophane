var express=require("express");
var app=express();
var router=express.Router();
var http=require("http");
var https=require("https");
var httpListener=http.Server(app);
var io=require("socket.io")(httpListener);
var querystring=require("querystring");
var simperium=require("./simperium");
var bodyParser=require("body-parser");

/*
var simperiumAppName = process.env.SIMPERIUM_APP_ID || "miles-secretaries-5c5";
var simperiumApiKey = process.env.SIMPERIUM_API_KEY || "11afb5edc0b74c75b21518654f960d5f";
*/
var simperiumAppName = process.env.SIMPERIUM_APP_ID || "photo-wages-1b6";
var simperiumApiKey = process.env.SIMPERIUM_API_KEY || "59d266d2e77d4c89a39fad5172a5f3f7";
var port = process.env.PORT || 5000;

var captureTokens={};
var activeUsers={};

var authorizeUser = function(options,callback){
  apiKey = options.apiKey || simperiumApiKey;
  appName = options.appName || simperiumAppName;
  var requestString="";
    simperium.init(apiKey,appName,options.username,options.password,function(error,user){
      if(error){
        callback(true,user);
      }else{
        callback(false,user);
      }
    });
}


//Getting auth Requests
app.route("/1/:appName/:method/").all(function(req,res,next){//Main router
  req.appName=req.params.appName;
  req.action=req.params.method;
  if(req.headers['x-simperium-token']){
    if(captureTokens[req.headers['x-simperium-token']]){
      //capture
      next();
    }
    else{
      //don't capture
      log("Passing along request by "+req.headers['x-simperium-token']+" to "+req.url);
      var options = {
        hostname: "api.simperium.com",
        port: 443,
        path: req.url,
        method: req.method || "GET",
        headers: {"x-simperium-token":req.headers['x-simperium-token']}
      };
      console.log(req.method);
      remote=https.request(options,function(response){
        res.statusCode=response.statusCode;
        res.statusMessage=response.statusMessage;
        response.pipe(res).on("end",function(){
          res.end();
        });
      });
      req.pipe(remote).on("end",function(){
        remote.end();
        });
    }
  }else{
    next();
  }
}).get(function(req,res,next){
  console.log("GET request detected");
  next();
}).post(function(req,res,next){
  console.log("POST request detected");
  if(req.action=="authorize"){
    log("Simperium Auth Request Received");
    responseString="";
    req.on("data",function(data){
      responseString+=data;
    }).on("end",function(){
      var json=JSON.parse(responseString);
      console.log(json);
      authOptions={
        username: json.username
        ,password: json.password
        ,appName: req.appName
      };
      if(req.headers['x-simperium-api-key']){
        authOptions['apiKey']=req.headers['x-simperium-api-key'];
      }
      authorizeUser(authOptions,function(err,user){
        if(!err){
          res.end(JSON.stringify({
            username:user.username,
            access_token: user.accessToken,
            userid: user.userId
          }));
        }
      });
    });
  }
}).delete(function(req,res,next){
  next();
});
//modify objects
app.route("/1/:appName/:bucket/i/:object_id").all(function(req,res,next){
  user=simperium.getUser(req.headers["x-simperium-token"]);
  if(user){
    bucket=user.getBucket(req.params.bucket);
  }
  else{
/*
    res.statusCode = 401;
    res.statusMessage = "Unauthorized";
*/
    res.end();
  }
  
});
app.route("/admin").all(function(req,res,next){
  next();
}).get(function(req,res,next){
  res.sendFile(__dirname+"/index.html");
});
/*
app.get("/socket.io/socket.io.js",function(req,res,next){
  res.sendFile(__dirname+"/node_modules/socket.io/lib/client.js")
});
*/

io.on('connection',function(socket){
  socket.on("addLogin",function(data){
    
  });
  socket.on("list",function(payload){
    socket.emit("listing",activeUsers);
  });
  socket.on("add",function(payload){
    if(payload.length>=2){
      username=payload[0];
      password=payload[1];
      if(payload.length=4){
        appName=payload[2];
        apiKey=payload[3];
      }
      authorizeUser({username:username
        ,password:password
        ,appName:appName
        ,apiKey:apiKey
      },function(err,user){
        if(!err){
          socket.emit("reply","user created and authorized: (token "+user.accessToken+")");
          captureTokens[user.accessToken]=user.userId;
          activeUsers[username]=user.userId;
          }
          else{
            socket.emit("reply","error authorizing user");
          }
      });
    }
  });
  socket.on("token",function (payload){
    if(payload.length==2){
      accessToken=payload[0];
      username=payload[1];
      if(activeUsers[username]){
        captureTokens[accessToken]=activeUsers[username];
        socket.emit("reply","Successfully associated token "+accessToken+" with user "+username+" (userid "+activeUsers[username]+")");
      }else{
        socket.emit("error","The username is invalid");
      }
    }
  });

  console.log("io connection detected");
})


// app.use(bodyParser.urlencoded());
httpListener.listen(port,function(){
  log("Listening on port ",port);
});

function log(message,objects){
  message=JSON.stringify(message);
  if(objects){
    if(typeof objects=="object"){
      for(var key in objects){
        message+=" "+JSON.stringify(object[key]);
      }
    }
    else{
      message+=" "+JSON.stringify(objects);
    }
  }
  console.log(message);
  io.emit("message",message);
}

/* curl -H 'X-Simperium-API-Key: 11afb5edc0b74c75b21518654f960d5f' -d '{"username":"yuchuan@tinkertanker.com", "password":"password"}' https://auth.simperium.com/1/miles-secretaries-5c5/authorize/

curl -H 'X-Simperium-API-Key: 59d266d2e77d4c89a39fad5172a5f3f7' -d '{"username":"yyc478@gmail.com", "password":"password"}' http://localhost:5000/1/photo-wages-1b6/authorize/

curl -H 'X-Simperium-Token: 8fed3276d8314e339403dd019f885d8f' https://api.simperium.com/1/miles-secretaries-5c5/buckets

curl -H 'X-Simperium-Token: 8fed3276d8314e339403dd019f885d8f' https://api.simperium.com/1/miles-secretaries-5c5/eventschema/index?data=true


var cb=function(err,resp){
  if(!err){
    console.log("Success!",resp);
    }
  else{
    console.log("some error occurred");
    console.log(err);
  }
}
*/
