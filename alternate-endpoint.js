//Load required libraries
var express=require("express");
var app=express();
var router=express.Router();
var http=require("http");
var https=require("https");
var httpListener=http.Server(app);
var io=require("socket.io")(httpListener);
var uuid=require("node-uuid");
var sockjs = require('sockjs');
var sockClient = require('sockjs-client-node');

module.exports={
  start:start
  , app: app
  , test: testData
  };

//Load internal utilities
var simperium=require("./simperium");
var merge=require("./merge_recursively")

//Load default configurations
var configs=require("./config.js");
var simperiumAppName =configs.appName;
var simperiumApiKey = configs.apiKey;
var testUsername=configs.username;
var testPassword=configs.password;
var port = configs.port;
var defaultOptions=configs.options;
if(process.env.OPTIONS){
  merge(defaultOptions,JSON.parse(process.env.OPTIONS));
}
var options={};
var captureTokens={};
var activeUsers={};
var activeApps={};
merge(options,defaultOptions);

//Setup Redis
var redis=require("then-redis");
if (process.env.REDISTOGO_URL) {
  var rtg   = require("url").parse(process.env.REDISTOGO_URL);
  var db = redis.createClient(rtg.port, rtg.hostname);
  db.auth(rtg.auth.split(":")[1]);
} else {
  var db=redis.createClient();
}
db.scanSet=function(key){
  return new Promise(function(fulfill,reject){
    var promiseArray=[];
    var set=[];
    var handler=function(response){
      return new Promise(function(fulfill,reject){
        set=set.concat(response[1]);
        if(response[0]!=0){
          promiseArray.push(db.sscan(key,response[0]).then(handler,function(error){
            reject(error);
          }));
        }
        fulfill();
      });
    };
    promiseArray.push(db.sscan(key,0).then(handler,function(error){
      return Promise.reject(error);
    }));
    Promise.all(promiseArray).then(function(){
      fulfill(set);
    });
  });
}

var notFound="<html><title>404: Not Found</title><body>404: Not Found</body></html>";

function start(done){



//Getting all auth requests and /buckets (since they match the same route pattern
app.route("/1/:appName/:method/").all(function(req,res,next){//Main router
  req.appName=req.params.appName;
  req.action=req.params.method;
  if(req.headers['x-simperium-token']){
    //This route should only match the api.simperium.com/1/appName/buckets method
    if(captureTokens[req.headers['x-simperium-token']]){
      //capture
       var user=simperium.getUserByToken(req.headers["x-simperium-token"],captureTokens[req.headers["x-simperium-token"]]);
      if(user){
        array=[];
        for(var key in user.buckets){
          array.push({name:key});
        }
        res.end(JSON.stringify({buckets:array}));
      }else{
        user = simperium.init(req.appName,captureTokens[req.headers['x-simperium-token']],req.headers['x-simperium-token']);
        user.bucketList(user,function(err,response){
          if(!err){
            res.end(JSON.stringify(response));
          }else{
            res.end(response);
            log(response);
          }
        });
      }
    } else{
      var options = {
        hostname: "api.simperium.com",
        path: req.url,
        method: req.method || "GET",
        headers: {"x-simperium-token":req.headers['x-simperium-token']}
      };
      passthrough(options,req,res);
    } 
  }else if(req.action=="buckets"){
    res.statusCode=401;
    res.statusMessage = "Unauthorized";
    res.end("401 Unauthorized: Missing Token");
  }
  else{
    next();
  }
}).get(function(req,res,next){
  log("GET request detected");
  if(req.action=="buckets"){
    
  }
  next();
}).post(function(req,res,next){
  //Only authorize is of any interest, we can let the rest through without parsing
  if(req.action=="authorize"){
    responseString="";
    req.on("data",function(data){
      responseString+=data;
    }).on("end",function(){
      var json=JSON.parse(responseString);
      authOptions={
        username: json.username
        ,password: json.password
        ,appName: req.appName
      };
      if(req.headers['x-simperium-api-key']){
        authOptions['apiKey']=req.headers['x-simperium-api-key'];
      }
      if(!activeUsers[authOptions.username]){
        //Passthrough manually because data is already read
        var options = {
          hostname: "auth.simperium.com",
          path: "/1/"+req.appName+"/authorize/",
          port:443,
          method: "POST",
          headers: {"x-simperium-api-key":req.headers['x-simperium-api-key']}
        };
        remote=https.request(options,function(response){
          res.statusCode=response.statusCode;
          res.statusMessage=response.statusMessage;
          response.pipe(res).on("end",function(){
            res.end();
          });
        });
        remote.end(JSON.stringify(authOptions));
      }else{
        authorizeUser(authOptions).then(function(user){
          response=JSON.stringify({
            username:user.username,
            access_token: user.accessToken,
            userid: user.userId
          });
          res.end(response);
        },function(error){
            res.statusCode=400;
            res.end(error)
        });
      }
    });
  }
  else{
    var options = {
      hostname: "auth.simperium.com",
      path: req.url,
      method: req.method || "POST",
      headers: {"x-simperium-api-key":req.headers['x-simperium-api-key']}
    };
    passthrough(options,req,res);
  }
}).delete(function(req,res,next){
  log("DELETE");
  next();
});

//Requests to api.simperium.com
//Middleware
var apiAll=function(req,res,next){
  //filters for tokens of interest and ignores the rest (passes them through directly)
  if(!req.headers["x-simperium-token"]){
    res.statusCode=401;
    res.statusMessage = "Unauthorized";
    res.end("401 Unauthorized: Missing Token");
  }else{
    if(captureTokens[req.headers["x-simperium-token"]]){
      req.user=simperium.getUserByToken(req.headers["x-simperium-token"],captureTokens[req.headers["x-simperium-token"]]);
      if(!req.user){
        req.user = simperium.init(req.appName,captureTokens[req.headers['x-simperium-token']],req.headers['x-simperium-token']);
      }
      next();
    } else{
      var options = {
        hostname: "api.simperium.com",
        path: req.url,
        method: req.method || "GET",
        headers: {"x-simperium-token":req.headers['x-simperium-token']}
      };
      passthrough(options,req,res);
    }
  }
}
var objectAll=function(req,res,next){
  if(!req.params.object_id){
    res.statusCode=404;
    res.end(notFound);
  } else{
    next();
  }
}
var objectGet=function(req,res,next){
  if(req.params.version){
    var objectVersion=req.params.version;
  }
  db.hgetall(itemKey(req.user.userId,req.params.bucket,req.params.object_id))
  .then(function(response){
    if(response){
      res.statusCode=200;
      res.end(JSON.stringify(response));
    }else{
      res.statusCode=404;
      res.end(notFound);
    }
  });
}
var objectPresent=function(req,res,next){
  db.exists(itemKey(req.user.userId,req.params.bucket,req.params.object_id))
  .then(function(response){
    if(response){
      next();
    }
    else{
      simperium.getUserById(req.user.userId).getBucket(req.params.bucket).itemRequest(req.params.object_id,req.method,req.params.version)
      .then(function(response){
        console.log(response.statusCode,response.body);
        res.statusCode=response.statusCode;
        if(response.headers["x-simperium-version"]){
          res.setHeader("X-Simperium-Version",response.headers["x-simperium-version"]);
        }
        res.end(response.body);
        switch(res.statusCode){
          case 200: //success

          break;
          case 400: //bad request, check input data

          break;
          case 401: //authorization error, check token

          break;
          case 404: //specified object version does not exist

          break;
          case 412: //empty change, object was not modified
          
        }
      },function(error){
        res.statusCode=500;
        res.end(error);
      })
    }
  })
}
var readJsonBody=function(req,res,next){
  req.body="";
  req.on("data",function(data){
    req.body+=data;
  });
  req.on("end",function(){
    if(req.body!=""){
      req.json=JSON.parse(req.body);
      next();
    }else{
      res.statusCode=400;
      res.end("Bad Request, Check Input Data");
    }
  });
}
var objectPost=function(req,res,next){
  db.multi();index=0;
  if(req.query.ccid){
    //check if change has been submitted before. ccid=client change id
    db.zscore(ccidsKey(req.user.userId,req.params.bucket),req.query.ccid);index++;
  }
  //check for version numbers to determine whether I should overwrite
  db.hget(versionsKey(req.user.userId,req.params.bucket),itemKey(req.user.userId,req.params.bucket,req.params.object_id));
  hashindex=index;
  index++;
  db.exec().then(function(response){
    if((req.query.ccid&&response[0]!=null)||!req.query.ccid){
      db.multi();multiIndex=0;
      if(req.query.replace=="1"||req.query.replace==1){
        db.del(itemKey(req.user.userId,req.params.bucket,req.params.object_id));multiIndex++
      }
      changeLog=req.params;
      changeLog.d=req.json;
      changeLog.id=req.params.object_id;
      if(req.query.ccid){
        ccid=req.query.ccid;
      }
      else{
        ccid=uuid.v4()
      }
      db.hmset(itemKey(req.user.userId,req.params.bucket,req.params.object_id),req.json);multiIndex++
      db.zadd(ccidsKey(req.user.userId,req.params.bucket),1,changeLog);multiIndex++
      //increment version
      versionIndex=multiIndex;
      db.hincrby(versionsKey(req.user.userId,req.params.bucket),itemKey(req.user.userId,req.params.bucket,req.params.object_id),1);multiIndex++
      if(req.query.response){
        var hgetAllIndex=multiIndex;
        db.hgetall(itemKey(req.user.userId,req.params.bucket,req.params.object_id));multiIndex++
      }
      db.exec().then(function(response2){
        if(response2!=null){
          res.statusCode=200;
          res.setHeader("X-Simperium-Version",response2[versionIndex]);
          if(req.query.response){
            res.end(JSON.stringify(parseArray(response2[hgetAllIndex])));
          } else{
            res.end("");
          }
        } else{
          res.statusCode=500;
          res.statusMessage="redis error";
          res.end();
        }
      });
    } else{
      res.statusCode=412;
      if(req.query.response){
        db.hgetall(itemKey(req.user.userId,req.params.bucket,req.params.object_id))
        .then(function(response){
          res.end(JSON.stringify(parseArray(response)));
        })
      }else{
        res.end();
      }
    }
  })

}
var objectDel=function(req,res,next){
  db.multi();
  db.del(itemKey(req.user.userId,req.params.bucket,req.params.object_id));
  db.hincrby(versionsKey(req.user.userId,req.params.bucket),itemKey(req.user.userId,req.params.bucket,req.params.object_id),1);
  db.exec().then(function(response){
    if(response!=null){
      res.setHeader("X-Simperium-Version",response[1]);
      res.statusCode=200;
      res.end();
    }
    else{
      res.statusCode=500;
      res.statusMessage="Redis storage error";
    }
  })
}
app.route("/1/:appName/:bucket/index").all(apiAll).get(function(req,res,next){
  if(typeof simperium.getUserById(req.user.userId).getBucket(req.params.bucket).itemCount=="number"){
    var idSlice=req.user.userId.length+req.params.bucket.length+2;
    var mark=req.query.mark || 0;
    var limit=req.query.limit || 100;
    db.hscan(versionsKey(req.user.userId,req.params.bucket),mark,{"count":limit})
    .then(function(keys){
      if(keys[0]){
        mark=keys[0];
      }
      else{
        mark=undefined;
      }
      return new Promise(function(fulfill,reject){
        var index=[];
        if(req.query.data=="true"){
          if(Object.keys(keys[1]).length){
            keyArray=Object.keys(keys[1]);
            db.mget(keyArray).then(function(objArray){
            for(i=0;i<keyArray.length;i++){
                index.push({
                  id: keyArray[i].slice(idSlice)
                  , d: objArray[i]
                  , v: keys[1][keyArray[i]]
                });
              }
              fulfill(index);
            },function(error){
              log("Error retrieving objects")
              reject(error);
            });
          } else{
          fulfill(index,mark);
          }
        }
        else{
          for(i=0;i<keyArray.length;i++){
            index.push({
                id: keyArray[i].slice(idSlice)
                , v: keys[1][keyArray[i]]
            });
            fulfill(index,mark);
          }
        }
      });
    },function(error){
        log("hgetall failed "+error);
    })
    .then(function(index,mark){
      db.get(currentKey(req.user.userId,req.params.bucket)).then(function(curr){
        res.end(JSON.stringify({
          index:index
          ,current:curr
          }));
      })
    },function(error){
      log(error);
      res.statusCode=500;
      res.end(JSON.stringify(error));
    });
  }else{
    options=req.query;
    req.user.getBucket(req.params.bucket).index(options)
    .then(function(response){
      res.statusCode=200;
      res.end(JSON.stringify(response));
    //Store everything in the cache
      if(options.data){
        versionHash={};
        db.multi();
        response.index.forEach(function(data){
          versionHash[data.id]=data.v;
          if(Object.keys(data.d).length){
            db.hmset(itemKey(req.user.userId,req.params.bucket,data.id),data.d);
          } else{
            console.log("Skipping over "+itemKey(req.user.userId,req.params.bucket,data.id)+" because it's an empty object");
          }
        });
        db.hmset(versionsKey(req.user.userId,req.params.bucket),versionHash);
        db.exec().then(function(){
          log("Successfully cached "+res.length+" items in "+req.params.bucket);
        },function(error){
          log("Unsucessfully cached elements in "+req.params.bucket+":  Error "+error);
        });
      }
    },function(err){
      log(err);
      res.statusCode=500;
      res.end(err);
    });
  }
});

app.route("/1/:appName/:bucket/i/:object_id")
.all(apiAll).all(objectAll)
.get(objectPresent).get(objectGet)
.post(readJsonBody).post(objectPost)
.delete(objectPresent).delete(objectDel);
app.route("/1/:appName/:bucket/i/:object_id/v/:version").all(apiAll).all(objectAll)
.get(objectPresent).get(objectGet)
.post(readJsonBody).post(objectPost)
.delete(objectPresent).delete(objectDel);


//Admin routes
app.route("/admin/test").all(function(req,res,next){
  testData(req.query.ds).then(function(user){
    console.log(req.query.ds);
    res.end(JSON.stringify(user));
  });
});



app.route("/admin").all(function(req,res,next){
  next();
}).get(function(req,res,next){
  res.sendFile(__dirname+"/index.html");
});
app.route("/misc/*").get(function(req,res,next){
  res.sendFile(__dirname+"/misc/"+req.url.slice(6));
})
/*
app.get("/socket.io/socket.io.js",function(req,res,next){
  res.sendFile(__dirname+"/node_modules/socket.io/lib/client.js")
});
*/

//Admin page, might switch over to webSockets as well and remove socket.io
io.on('connection',function(socket){
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
      } else{
        appName=simperiumAppName;
        apiKey=simperiumApiKey;
      }
      authorizeUser({username:username
        ,password:password
        ,appName:appName
        ,apiKey:apiKey
      }).then(function(user){
        socket.emit("reply","user created and authorized: (token "+user.accessToken+")");
        captureTokens[user.accessToken]=user.userId;
        activeUsers[username]=user.userId;
        activeApps[appName]=1;
        for(var key in user.buckets){
          ary.push(cacheBucket(user,key));
        }
        Promise.all(ary).then(function(response){
          socket.emit("reply","Buckets cached");
        },function(error){
          socket.emit("error","Buckets couldn't be cached");
          log(error);
        });
      },function(error){
          socket.emit("reply","error authorizing user "+error);
          log(error);
      });
    }
  });
  socket.on("store",function(payload){
    switch(payload[0]){
      case "flush":
        db.send("FLUSHDB").then(function(success){
          socket.emit("reply","Store successfully flushed "+success);
        },function(error){
          socket.emit("error","couldn't flush store"+error);
        });
      break;
      case "list":
        db.keys(payload[1]).then(function(response){
          socket.emit("reply","Keys follow");
          socket.emit("listing",response);
        },function(error){
          socket.emit("error","couldn't get listing store"+error);
        });      
      break;
      case "get":
        db.get(payload[1]).then(function(response){
          socket.emit("reply",response);
        },function(error){
          socket.emit("error","couldn't fetch. "+error);
        })
      break;
      default:
        db.send(payload[0],payload.slice(1)).then(function(response){
          socket.emit("reply","Response as follows ");
          socket.emit("listing",response);
        },function(error){
          socket.emit("error","couldn't flush store"+error);
        })
      break;
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
        socket.emit("error","Username not found! Please use the add <username> <password> command first");
      }
    }
  });
  socket.on("test",function(payload){
    process.env.NODE_ENV = "dev";
    testData(payload[0]).then(function(user){
      socket.emit("reply","user created and authorized: (token "+user.accessToken+")");
    },function(error){
      socket.emit("reply","error authorizing user"+error);
    });
  });
  socket.on("option",function(payload){
    switch (payload[0]){
      case "set":
        if(payload[1]){
          if(payload[2]){
            options[payload[1]]=payload[2];
            socket.emit("reply","Set "+payload[1]+" to "+payload[2]);
          }
          else if(defaultOptions[payload[1]]){
            socket.emit()
            socket.emit("reply","Set "+payload[1]+" to default value of "+defaultOptions[payload[1]]);
          }else{
            socket.emit("error",payload[1]+"requires a value");
          }
        }else{
          socket.emit("error","option set requires a key");
        }
      break;
      case "delete":
        if(payload[1]){
          if(defaultOptions[payload[1]]){
            socket.emit("reply","Reset "+payload[1]+" to default value of "+defaultOptions[payload[1]]);
          }else{
            if(options[payload[1]]){
              socket.emit("reply",payload[1]+" => "+options[payload[1]]+"deleted");
              delete options[payload[1]];
            }else{
              socket.emit("error",payload[1]+" does not exist");
            }
          }
        }else{
          socket.emit("error","option delete requires a key (use reset to delete all)");
        }
      break;
      case "list":
        socket.emit("listing",options);
      break;
      case "reset":
        options={};
        if(process.env.OPTIONS){
          merge(defaultOptions,JSON.parse(process.env.OPTIONS));
        }
        merge(options,defaultOptions);
        socket.emit("reply","All settings reset to default");
        socket.emit("listing",options);
      break;
    }
  });
  socket.on("delete",function(payload){
    if(payload[0]){
      if(activeUsers[payload[0]]){
        userId=activeUsers[payload[0]];
        delete activeUsers[payload[0]];
        for(var key in captureTokens){
          if(captureTokens[key]==userId){
            simperium.removeToken(captureTokens[key]);
            delete captureTokens[key];
          }
        }
        simperium.removeUser(userId);
        emit("reply","removed user "+payload[0]);
      } else{
        emit("error","user not found");
      }
    } else{
      emit("error","delete requires at least parameter")
    }
  });
  socket.on("upsync",function(payload){
    if(payload[0]){
      if([payload[1]]=="--resolve"){
        //overwrite
      } else{
        //don't overwrite
      }
    }else{
      socket.emit("error","upsync requires options");
    }
  });
  socket.on("downsync",function(payload){
    if(payload[0]){
      if(activeUsers[payload[0]]){
        userId=activeUsers[payload[0]];
        var user=simperium.getUserById(userId);
        if(user){
          bucketPromises=[];
          buckets=user.buckets;
          for(var key in buckets){
            bucketPromises.push(cacheBucket(userId,key,(payload[1]=="--overwrite")));
          }
          Promise.all(bucketPromises).then(function(){
            socket.emit("reply","Downsync complete");
          })
        }
        else{
          socket.emit("error","user not recognized (add user first?)");
        }
      } else{
        socket.emit("error","user not recognized (add user first?)");
      }
    }else{
      socket.emit("error","downsync requires options");
    }
  });//incomplete
    
  log("io connection detected");
})

//SocketJS to handle WebSocket API calls
var interceptor = sockjs.createServer({ sockjs_url: 'http://cdn.jsdelivr.net/sockjs/0.3.4/sockjs.min.js'});
interceptor.on('connection', function(conn) {
    var heartBeatCount=0;
    var intercept=true;
    var remote;
    conn.on('data', function(message) {
      if(message[0]=='h'){ // heartbeat
        conn.write("h:"+heartBeatCount);
        heartBeatCount++;
      }
      else{
        if(!intercept){ // don't intercept, just let it go
          remote.send(message);
        } else{
          heads=message.split(':',2);
          data=message.slice(heads[0].length+heads[1].length+2);
          switch(heads[1]){
            case "init":
              json=JSON.parse(data);
              if(captureTokens[json.token]){
                user = simperium.getUserByToken(json.token);
                conn.write("0:auth:"+user.username);
              } else{ //not interested, create new remote connection and pass everything through
                remote = new sockClient('https://api.simperium.com/sock/1/'+userid+"/");
                intercept=false;
                remote.onopen=function(){
                  remote.send(message);
                }
                remote.onmessage=function(message){
                  conn.write(message.data);
                }
              }
            break;
          }
        }
      }
    });
    conn.on('close', function() {});
});
var proxy = sockjs.createServer({ sockjs_url: 'http://cdn.jsdelivr.net/sockjs/0.3.4/sockjs.min.js'
});
proxy.on('connection', function(conn) {
    params=conn.url.split("/");
    userid=params[3];
    remote = new sockClient('https://api.simperium.com/sock/1/'+userid+"/");
    remote.onopen=function(){
      console.log("connected");
    };
    conn.on('data', function(message) {
      if(remote.readyState==1){
        remote.send(message);
        console.log("sending to remote",message);
      }
    });
/*
    conn.on('close', function() {
      remote.close();
      console.log("local closed");
    });
*/
    remote.onmessage=function(message){
      if(conn.writable){
        conn.write(message.data);
        console.log("sending to local",message.data);
      }
    };
/*
    remote.on("close",function(){
      if(conn.writable){
        conn.write("closing");
        conn.close();
        console.log("remote closed");
      }
    });
*/
});
app.route("/sock/1/:app_id/info").get(function(req,res,next){
    //Hacky way to imitate the /info handshake. Basically just tells the client that it's okay to connect to any random path under this one. If there are a significant number of users then I'd have to actually keep track of the entropy to prevent colliding sockets.
  prefixUrl=req.url.slice(0,-5);
  if(activeApps[req.params.app_id]){
    res.statusCode=101;
    res.statusMessage="Switching Protocols";
    //Strip out the /info
    interceptor.installHandlers(httpListener, {prefix:prefixUrl});
    res.end(JSON.stringify({"websocket":true,"origins":["*:*"],"cookie_needed":false,"entropy":(Math.random()*1000000000)}));
  } else{ //Ignore connection and pass it on to the actual simperium endpoint.
    res.statusCode=301;
    res.statusMessage="Moved Permanently";
    res.setHeader("Location","https://api.simperium.com"+req.url);
    //Have to actually act as a proxy instead of redirecting because of same-origin policies
    proxy.installHandlers(httpListener, {prefix:prefixUrl});
    res.end();
  }
});


httpListener.listen(port,function(){
  if(done){
    done();
  }
});

}

function passthrough(opts,req,res,callback){
    //don't capture
  log("Passing along request by "+(req.headers['x-simperium-token']||req.headers['x-simperium-api-key'])+" with options",opts);
  var options = {
    hostname: "api.simperium.com",
    port: 443,
    method: "GET"
  };
  merge(options,opts);
  remote=https.request(options,function(response){
    res.statusCode=response.statusCode;
    res.statusMessage=response.statusMessage;
    if(response.headers['x-simperium-version']){
      res.setHeader("X-Simperium-Version",response.headers['x-simperium-version']);
    }
    response.pipe(res).on("end",function(){
      if(typeof callback == "function"){
        callback();
      }
      res.end();
    });
  });
  req.pipe(remote).on("end",function(){
    remote.end();
  });
}
function log(message,objects){
  message=JSON.stringify(message);
  if(objects){
    if(typeof objects=="object"){
      message+="{";
      for(var key in objects){
        message+="\n"+key+"=>"+JSON.stringify(objects[key]);
      }
    }
    else{
      message+=" "+JSON.stringify(objects);
    }
  }
  if (process.env.NODE_ENV !== 'test') {
    console.log(message);
  }
  io.emit("message",message);
}
function delayedPromise(ms){ // quick promisified delay function
    return new Promise(function(r){setTimeout(r,ms);});
}
function authorizeUser(options){
  return new Promise(function(fulfill,reject){
    apiKey = options.apiKey || simperiumApiKey;
    appName = options.appName || simperiumAppName;
    if(options.username){
      if(activeUsers[options.username]){
        user=simperium.getUserById(activeUsers[options.username]);
        if(user){
          fulfill(user);
        } else{
          log("user is null for some reason",activeUsers);
          simperium.authorize(apiKey,appName,options.username,options.password)
          .then(function(user){
            fulfill(user);
          },function(error){
            reject(error);
          });
        }
      }
      else{
  //For production can just make this pass through. Or maybe not? Would be useful to capture all auth data.
        simperium.authorize(apiKey,appName,options.username,options.password)
        .then(function(user){
            fulfill(user);
          },function(error){
            reject(error);
          });
      }
    } else{
      reject("Missing username");
    }
  });
}
function itemKey(userId,bucketName,itemId){
  return userId+"-"+bucketName+"-"+itemId+"";
}
function versionsKey(userId,bucketName){
    return userId+"-"+bucketName+"~keys";
}
function ccidsKey(userId,bucketName){
    return userId+"-"+bucketName+"~ccids";
}
function ccidKey(userId,bucketName,ccid){
  return userId+"-"+bucketName+"/"+ccid;
}
function currentKey(userId,bucketName){
    return userId+"-"+bucketName+"~current";
}
function cacheBucket(userId,bucketName,overwrite){
  return new Promise(function(fulfill,reject){
    twinArray=[];
    if(overwrite){
      twinArray.push(purgeBucket(userId,bucketName));
    }
    var res;
    var current;
    twinArray.push(simperium.getUserById(userId).getBucket(bucketName).getAll().then(function(response){
      res=response.index;
      current=response.current;
      return Promise.resolve();
    },function(error){
      return Promise.reject();
    }));
    Promise.all(twinArray).then(function(){
      versionHash={};
      indexHash={};
      if(res.length){
        db.multi();
        res.forEach(function(data){
          versionHash[itemKey(userId,bucketName,data.id)]=data.v;
          if(Object.keys(data.d).length){
            db.hmset(itemKey(userId,bucketName,data.id),data.d);
          } else{
            console.log("Skipping over "+itemKey(userId,bucketName,data.id)+" because it's an empty object");
          }
        });
        promiseArray=[];
        db.hmset(versionsKey(userId,bucketName),versionHash);
        db.del(ccidKey(userId,bucketName));
        db.set(currentKey(userId,bucketName),current);
        db.exec().then(function(){
          log("Successfully cached "+res.length+" items in "+bucketName);
          simperium.getUserById(userId).getBucket(bucketName).itemCount=res.length;
          fulfill();
        },function(error){
          log("Problem with caching"+error);
          reject(error);
        });
      } else{
        log(bucketName+" is empty, nothing cached.");
        fulfill();
      }
    },function(error){
      log("Problem with purging or getAll",error);
      reject(error);
    });
  });
}
function purgeBucket(userId,bucketName){
  return new Promise(function(fulfill,reject){
    db.hkeys(versionsKey(userId,bucketName)).then(function(keys){
      if(keys.length){
        db.del(keys).then(function(){
          log("Deleted all values in bucket",bucketName);
          fulfill();
        },function(error){
          reject(error)
        });
      }
      else{
        log(bucketName+" was empty, fulfilled automatically");
        fulfill();
      }
    });
  });
}
function testData(downsync){
  return new Promise(function(fulfill,reject){
    var ary=[];
    authorizeUser({username:testUsername
      ,password:testPassword
      ,appName:simperiumAppName
      ,apiKey:simperiumApiKey
    }).then(function(user){
      accessToken=user.accessToken
      captureTokens[accessToken]=user.userId;
      activeUsers[testUsername]=user.userId;
      captureTokens[accessToken]=activeUsers[testUsername];
      console.log(downsync);
      if(downsync!="false"&&downsync!=false){
        for(var key in user.buckets){
          ary.push(cacheBucket(user.userId,user.buckets[key].bucketName,true));
        }
      }
      Promise.all(ary).then(function(response){
        fulfill(user);
      },function(error){
        reject(error);
        log(error);
      });
    });
  });
}
function parseArray(array){
  hash={};
  for(i=0;i<array.length;i+=2){
    val=parseInt(array[i+1]);
    hash[array[i]]=isNaN(val)?array[i+1]:val;
  }
  return hash;
}