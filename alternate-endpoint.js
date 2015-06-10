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
var cachejs=require("./cache");
cache=new cachejs.Cache();
var authd=new cachejs.Auth();
var merge=require("./lib/merge_recursively");

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
merge(options,defaultOptions);
var notFound="<html><title>404: Not Found</title><body>404: Not Found</body></html>";


function start(done){
//Getting all auth requests and /buckets (since they match the same route pattern
app.route("/1/:appName/:method/").all(function(req,res,next){//Main router
  req.appName=req.params.appName;
  req.action=req.params.method;
  if(req.headers['x-simperium-token']){
    //This route should only match the api.simperium.com/1/appName/buckets method
    if(req.user=simperium.getUserByToken(req.headers['x-simperium-token'])){
      next();
    }
    else{
      authd.getUser(req.headers['x-simperium-token']).then(function(userId){
        if(userid){
          
        }
        else{
          var options = {
            hostname: "api.simperium.com",
            path: req.url,
            method: req.method || "GET",
            headers: {"x-simperium-token":req.headers['x-simperium-token']}
          };
          passthrough(options,req,res);
        }
      });
    } 
  }else if(req.action=="buckets"){
    res.statusCode=401;
    res.statusMessage = "Unauthorized";
    res.end("401 Unauthorized: Missing Token");
  }
  else{
    next();
  }
}).all(function(req,res,next){
  if(req.user){
    array=[];
    for(var key in req.user.buckets){
      array.push({name:key});
    }
    res.end(JSON.stringify({buckets:array}));
  }
  else{
    next();
  }
  }).get(function(req,res,next){
    log("GET request detected");
    next();
}).post(function(req,res,next){
  //Only authorize is of any interest, we can let the rest through without parsing
  if(req.action=="authorize"){
    var responseString="";
    req.on("data",function(data){
      responseString+=data;
    }).on("end",function(){
      var json=JSON.parse(responseString);
      var authOptions={
        username: json.username
        ,password: json.password
        ,appName: req.appName
      };
      if(req.headers['x-simperium-api-key']){
        authOptions['apiKey']=req.headers['x-simperium-api-key'];
      }
      if(req.user=simperium.getUserByUsername(authOptions.username)){
        res.end(JSON.stringify({
            username:req.user.username,
            access_token: req.user.accessToken,
            userid: req.user.userId
        }));
      }else{
        //Passthrough manually because data is already read
        var options = {
          hostname: "auth.simperium.com",
          path: "/1/"+req.appName+"/authorize/",
          port:443,
          method: "POST"
        };
        if(req.headers['x-simperium-api-key']){
          options.headers={"x-simperium-api-key":req.headers['x-simperium-api-key']};
        }
        remote=https.request(options,function(response){
          res.statusCode=response.statusCode;
          res.statusMessage=response.statusMessage;
          response.pipe(res).on("end",function(){
            res.end();
          });
        });
        remote.end(JSON.stringify(authOptions));
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
    if(req.user=simperium.getUserByToken(req.headers["x-simperium-token"])){
      next();
    }
    else{
      authd.getUser(req.headers['x-simperium-token']).then(function(userId){
        if(userId){
          req.user=simperium.getUserByToken(userId);
          if(!req.user){
            req.user = simperium.init(req.appName,userId,req.headers['x-simperium-token']);
          }
          next();
        }
        else{//Access Token doesn't exist in the database, so we pass it through
          var options = {
            hostname: "api.simperium.com",
            path: req.url,
            method: req.method || "GET",
            headers: {"x-simperium-token":req.headers['x-simperium-token']}
          };
          passthrough(options,req,res);
        }
      })
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
  cache.objectGet(req.user.userId,req.params.bucket,req.params.object_id,req.params.version)
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
  cache.objectExists(req.user.userId,req.params.bucket,req.params.object_id,req.params.version)
  .then(function(response){
    if(response){
      next();
    }
    else{
       simperium.getUserById(req.user.userId).getBucket(req.params.bucket).itemRequest(req.params.object_id,req.method,req.params.version)
      .then(function(response){
        console.log(response.statusCode,response.json);
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
  if(!req.json.ccid){
    ccid=uuid.v4();
  } else{
    ccid=req.json.ccid;
  }
  options=req.query;
  options.replace=(options.replace=="1"||options.replace==1);
  options.version=req.params.version;
  cache.objectSet(req.user.userId,req.params.bucket,req.params.object_id,req.json,options,ccid)
  .then(function(response){
    if(response[0]){
      res.statusCode=200;
      res.setHeader("X-Simperium-Version",response[1]);
    } else{
      res.statusCode=412;
      res.statusMessage="Not Modified";
    }
    if(req.query.response){
      res.end(JSON.stringify(response[2]));
    }
    else{
      res.end();
    }
  },function(error){
    log(error);
    res.statusCode=500;
    res.write(error);
    res.end();
  });
}
var objectDel=function(req,res,next){
  if(!req.query.ccid){
    ccid=uuid.v4();
  } else{
    ccid=req.query.ccid;
  }
  cache.objectDelete(req.user.userId,req.params.bucket,req.params.object_id,req.params.version,ccid).then(function(response){
    console.log(response);
    if(response[1]==200||response[1]==412){
      res.setHeader("X-Simperium-Version",response[0]);
      res.statusCode=response[1];
      res.end();
    }
    else{
      res.statusCode=response[1];
      res.statusMessage="Redis storage error";
      res.end();
    }
  })
}
app.route("/1/:appName/:bucket/index").all(apiAll).get(function(req,res,next){
  if(typeof simperium.getUserById(req.user.userId).getBucket(req.params.bucket).itemCount=="number"){
    cache.getIndex(req.user.userId,req.params.bucket,req.query).then(function(response){
      
      res.statusCode=200;
      res.end(JSON.stringify({
        index:response[0]
        ,current:response[1]
        ,mark:response[2]
      }));
    },function(error){
      res.statusCode=500;
      res.end(error);
    });
  }else{
    options=req.query;
    req.user.getBucket(req.params.bucket).index(options)
    .then(function(response){
      res.statusCode=200;
      res.end(JSON.stringify(response));
    //Store everything in the cache
      if(options.data){
        cache.cacheIndex(req.user.userId,req.params.bucket,response.index,false).then(function(indexCount){
          oldCount=parseInt(simperium.getUserById(user).getBucket(json.name).itemCount)||0;
          if(!response.mark){
            console.log("Cache complete, stored "+indexCount+" items");
            simperium.getUserById(user).getBucket(json.name).itemCount=oldCount+indexCount;
          }
          else{
            console.log("Cache incomplete, stored "+indexCount+" items");
            simperium.getUserById(user).getBucket(json.name).itemCount=""+(oldCount+indexCount);
          }
          conn.write(channel+':'+'i:'+data);
        },function(error){
          log("Unsucessfully cached elements in "+channels[channel].bucketName+":  Error "+error);
          conn.write(channel+':'+'i:'+data);
        });
      }
    },function(err){
      log(err);
      res.statusCode=500;
      res.end(err);
    });
  }
});
app.route("/1/:appName/:bucket/all").all(apiAll).get(function(req,res,next){
  if(typeof simperium.getUserById(req.user.userId).getBucket(req.params.bucket).itemCount=="number"){
    cache.getChanges(req.user.userId,req.params.bucket,req.query.cv,false)
    .then(function(response){
      res.statusCode=200;
      res.end(response);
    },function(error){
      res.statusCode=500;
      res.end(error);
    });
  } else{
    var options = {
      hostname: "api.simperium.com",
      path: req.url,
      method: req.method || "GET",
      headers: {"x-simperium-token":req.headers['x-simperium-token']}
    };
    passthrough(options,req,res);
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
    res.end(JSON.stringify(user));
  },function(error){
    console.log("Test error",error);
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

//Admin page, might switch over to sockJS as well and remove socket.io
io.on('connection',function(socket){
  socket.on("list",function(payload){
    socket.emit("listing",activeUsers);
  });
  socket.on("add",function(payload){
    if(payload.length>=2){
      var username=payload[0];
      var password=payload[1];
      if(payload.length==4){
        var appName=payload[2];
        var apiKey=payload[3];
      } else{
        var appName=simperiumAppName;
        var apiKey=simperiumApiKey;
      }
      authorizeUser({username:username
        ,password:password
        ,appName:appName
        ,apiKey:apiKey
      }).then(function(user){
        socket.emit("reply","user created and authorized: (token "+user.accessToken+")");
/*
        captureTokens[user.accessToken]=user.userId;
        activeUsers[username]=user.userId;
        activeApps[appName]=1;
*/
        authd.addApp(appName);
        interceptor.installHandlers(httpListener, {prefix:"/sock/1/"+appName});
        authd.addUser(username,password,user.userId,appName);
        for(var key in user.buckets){
          cache.bucketCount(user.userId,key).then(function(res){
            console.log(user.userId,res[0],res[1]);
            if(res[1]){
              user.getBucket(key).itemCount=parseInt(res[1]);
            }
          })
        }
 /*
       for(var key in user.buckets){
          ary.push(cacheBucket(user.userId,key,false));
        }
        Promise.all(ary).then(function(response){
          socket.emit("reply","Buckets cached");
        },function(error){
          socket.emit("problem","Buckets couldn't be cached");
          log(error);
        });
*/
      },function(error){
          socket.emit("reply","error authorizing user "+error);
          log(error);
      });
    }
  });
  socket.on("store",function(payload){
    switch(payload[0]){
      case "flush":
        cache.db.send("FLUSHDB").then(function(success){
          socket.emit("reply","Store successfully flushed "+success);
        },function(error){
          socket.emit("problem","couldn't flush store"+error);
        });
      break;
      case "list":
        cache.db.keys(payload[1]).then(function(response){
          socket.emit("reply","Keys follow");
          socket.emit("listing",response);
        },function(error){
          socket.emit("problem","couldn't get listing store"+error);
        });      
      break;
      case "get":
        cache.db.get(payload[1]).then(function(response){
          socket.emit("reply",response);
        },function(error){
          socket.emit("problem","couldn't fetch. "+error);
        })
      break;
      default:
        cache.db.send(payload[0],payload.slice(1)).then(function(response){
          socket.emit("reply","Response as follows ");
          socket.emit("listing",response);
        },function(error){
          socket.emit("problem","couldn't flush store"+error);
        })
      break;
    }
  });
  socket.on("token",function (payload){
    if(payload.length==2){
      accessToken=payload[0];
      username=payload[1];
      if(user=simperium.getUserByUsername(username)){
        user.addToken(accessToken);
        socket.emit("reply","Successfully associated token "+accessToken+" with user "+username+" (userid "+user.userId+")");
      }else{
                socket.emit("problem","Username not found! Please use the add <username> <password> command first");
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
            socket.emit("problem",payload[1]+"requires a value");
          }
        }else{
          socket.emit("problem","option set requires a key");
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
              socket.emit("problem",payload[1]+" does not exist");
            }
          }
        }else{
          socket.emit("problem","option delete requires a key (use reset to delete all)");
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
      if(user=simperium.getUserByUsername(payload[0])){
        user.remove();
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
      socket.emit("problem","upsync requires options");
    }
  });
  socket.on("downsync",function(payload){
    if(payload[0]){
      var user;
      if(user=simperium.getUserByUsername(payload[0])){
        var bucketPromises=[];
        user.bucketList().then(function(buckets){
          console.log(buckets);
          buckets.buckets.forEach(function(val){
            console.log(user.userId,val['name']);
            bucketPromises.push(cacheBucket(user.userId,val['name'],(payload[1]=="--overwrite")));
          });
          Promise.all(bucketPromises).then(function(){
            socket.emit("reply","Downsync complete");
          });
        });
      } else{
        socket.emit("problem","user not recognized (add user first?)");
      }
    }else{
      socket.emit("problem","downsync requires options");
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
    var user;
    var channels=[];
    var clientId;
    var remoteMessageQueue=[];
    var channel2index={};
    conn.on('data', function(message) {
      if(message[0]=='h'){ // heartbeat
        conn.write("h:"+heartBeatCount);
        heartBeatCount++;
      }
      else{
        if(!intercept){ // don't intercept, just let it go
          console.log("Passing through",message)
          console.log("readyState",remote.readyState);
          remoteMessageQueue.push(message);
          if(remote.readyState){
            while(remoteMessageQueue.length){
              remote.send(remoteMessageQueue.shift());
            }
          }
        } else{
          console.log("Intercepting message",message);
          var heads=message.split(':',2);
          var data=message.slice(heads[0].length+heads[1].length+2);
          var channel=parseInt(heads[0]);
          switch(heads[1]){
            case "init":
              //authenticate and select bucket
              var json=JSON.parse(data);
              json.name=json.name.toLowerCase();
              if(user=simperium.getUserByToken(json.token)){
                clientId=json.clientid
                conn.write(heads[0]+":auth:"+user.username);
                if(isNaN(channel)){
                  channel=channels.length;
                }
                //send index
                channels[channel]=cache.addBucket(user.userId,json.name);
                if(typeOf(user.getBucket(json.name).itemCount)=="number"){
                  channels[channel].getIndex({limit:100,data:true}).then(function(response){
                    conn.write(channel+':'+'i:'+JSON.stringify({
                      index:response[0]
                      ,current:response[1]
                      ,mark:response[2]
                    }));
                    return Promise.resolve(response[0]);
                  },function(error){
                    console.log("index error",error);
                    return Promise.reject(error);
                  });
                }else{
                  if(!remote||remote.readyState==0){
                    remote = new sockClient ('https://api.simperium.com/sock/1/'+conn.url.split('/')[3]+"/");
                    intercept=false;
                    remoteMessageQueue.push(message);
                    remote.onopen=function(){
                      while(remoteMessageQueue.length){
                        remote.send(remoteMessageQueue.shift());
                      }
                    }
                    remote.onclose=function(){
                      console.log("remote connection closed");
                    }
                    remote.onmessage=function(msg){
                      hd=msg.data.split(':',2)
                      if(hd[1]=='i'){
                        //cache incomplete, continue
                        data=msg.data.slice(hd[0].length+hd[1].length+2);
                        //cache data
                        response=JSON.parse(data);
                        channels[channel].cacheIndex(response.index,false).then(function(indexCount){
                        oldCount=parseInt(user.getBucket(json.name).itemCount)||0;
                        if(!response.mark){
                          console.log("Cache complete, stored "+indexCount+" items");
                          user.getBucket(json.name).itemCount=oldCount+indexCount;
                        }
                        else{
                          console.log("Cache incomplete, stored "+indexCount+" items");
                          user.getBucket(json.name).itemCount=""+(oldCount+indexCount);
                        }
                        conn.write(channel+':'+'i:'+data);
                        },function(error){
                         log("Unsucessfully cached elements in "+channels[channel].bucketName+":  Error "+error);
                         conn.write(channel+':'+'i:'+data);
                      });
                      }
                    }
                  }
                }
                channels[channel].on("message",function(message){
                  conn.write(channel+":c:"+message);
                });
              } else{ //not interested, create new remote connection and pass everything through         
                remote = new sockClient('https://api.simperium.com/sock/1/'+conn.url.split('/')[3]+"/");
                intercept=false;
                remoteMessageQueue.push(message);
                remote.onopen=function(){
                  console.log(remote.readyState);
                  while(remoteMessageQueue.length){
                    remote.send(remoteMessageQueue.shift());
                  }
                }
                remote.onmessage=function(msg){
                  console.log("remote res",msg);
                  conn.write(message.data);
                }
              }
            break;
            case "i":
              //post index
              if(typeOf(user.getBucket(channels[channel].bucketName).itemCount)=="number"){
                query=data.split(":");
                var mark=parseInt(query[1]);
                var limit=query[query.length] || 100;
                channels[channel].getIndex({limit:100,data:true}).then(function(response){
                  conn.write(channel+':'+'i:'+JSON.stringify({
                    index:response[0]
                    ,current:response[1]
                    ,mark:response[2]
                  }));
                  return Promise.resolve(response[0]);
                },function(error){
                  console.log("index error",error);
                  return Promise.reject(error);
                });
              }
              else{
                remote.send(message);
              }
            break;
            case "cv":
              //Listen for new changes from cv
              channels[channel].subscribe();
              conn.write(channel+":c:[]");
            break;
            case "c":
              //Change object
              json=JSON.parse(data);
              if(json.o=="-"){
                //delete instead
                channels[channel].objectDelete(json.id,json.v,json.ccid)
                .then(function(res){
                  console.log("delete res",res);
                  if(res[1]!=200){
                    conn.write(channel+":c"+JSON.stringify([{
                      error: res[1]
                      , id: json.id
                      , clientid:clientId
                    }]));
                  }
                });
              }
              else{
                channels[channel].objectSet(json.id,json.v,{version:json.sv,diffObj:true,clientid:clientId},json.ccid)
                .then(function(res){
                  console.log(8,res);
                  if(res[0]==false){
                    conn.write(channel+":c:"+JSON.stringify([
                    {ccids: [json.ccid]
                      , clientid:clientId
                      , id: json.id
                      , error: 409
                    }]));
                  }
                });
              }
            break;
            case "e":
              //retrieving object.version
              var data=message.split(":");
              var channel=data[0];
              data=data[2].split(".");
              channels[channel].objectGet(data[0],data[1])
              .then(function(response){
                if(response){
                  conn.write(channel+":e:"+data[0]+"."+data[1]+"\n"+JSON.stringify({data:response}));
                }
                else{
                  console.log("Empty response");
                }
              },function(error){
                console.log(error);
              });
            break;
          }
        }
      }
    });
    conn.on('close', function() {
      cache.exit();
      channels.forEach(function(bucket){
        bucket.exit();
      })
    });
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
    conn.on('close', function() {
      if(remote.readyState==1){
        remote.close();
        console.log("local closed");
      }
    });
    remote.onmessage=function(message){
      if(conn.writable){
        conn.write(message.data);
        console.log("sending to local",message.data);
      }
    };
    remote.onclose=function(){
      if(conn.writable){
        conn.write("closing");
        conn.close();
        console.log("remote closed");
      }
    };
});

app.route("/sock/1/:app_id/info").get(function(req,res,next){
    //Hacky way to imitate the /info handshake. Basically just tells the client that it's okay to connect to any random path under this one. If there are a significant number of users then I'd have to actually keep track of the entropy to prevent colliding sockets.
  prefixUrl=req.url.slice(0,-5);
/*
  if(activeApps[req.params.app_id]){
    res.statusCode=200;
    res.statusMessage="Go Here";
    //Strip out the /info
*/
//    interceptor.installHandlers(httpListener, {prefix:prefixUrl});
    res.end(JSON.stringify({"websocket":true,"origins":["*:*"],"cookie_needed":false,"entropy":(Math.random()*1000000000)}));
/*
  } else{ //Ignore connection and pass it on to the actual simperium endpoint.
    res.statusCode=301;
    res.statusMessage="Moved Permanently";
    res.setHeader("Location","https://api.simperium.com"+req.url);
    //Have to actually act as a proxy instead of redirecting because of same-origin policies
    proxy.installHandlers(httpListener, {prefix:prefixUrl});
    res.end();
  }
*/
});

authd.getApps().then(function(res){
  res.forEach(function(appName){
    interceptor.installHandlers(httpListener, {prefix:"/sock/1/"+appName});
    console.log("Installed handlers on /sock/1/"+appName);
  });
  return authd.getUsers(false);
}).then(function(users){
  if(users != null){
    Object.keys(users).forEach(function(key){
      var json=JSON.parse(users[key]);
      var user;
      authd.getToken(json.userId).then(function(accessToken){
        user=simperium.init(json.appName,json.userId,accessToken);
        user.addAuth(key);
        return cache.bucketList(json.userId);
      }).then(function(bucketList){
        user.bucketList(bucketList);
        bucketCounts=[];
        bucketList.forEach(function(bucket){
          bucketCounts.push(cache.bucketCount(user.userId,bucket).then(function(count){
            user.getBucket(bucket).itemCount=count[1];
            return Promise.resolve(count);
          }));
          return Promise.all(bucketCounts)
        });
      });
    });
  }
  else{
    console.log("No user data stored in redis");
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
    var apiKey = options.apiKey || simperiumApiKey;
    var appName = options.appName || simperiumAppName;
    var user;
    if(options.username){
      if(user=simperium.getUserByUsername(options.username)){
        if(user){
          fulfill(user);
        } else{
          log("user is null for some reason");
          simperium.authorize(apiKey,appName,options.username,options.password)
          .then(function(user){
            authd.addUser(user.userName,user.password,user.userId,appName);
            authd.addToken(user.userId,user.accessToken);
            authd.addApp(appName);            
            fulfill(user);
          },function(error){
            reject(error);
          });
        }
      }
      else{
        console.log("No record found, checking redis..");
        //Check redis, then only do actual authorization with Simperium as a last resort
        authd.authorize(options.username,options.password).then(function(user){
          fulfill(simperium.init(user.appName,user.userId,user.accessToken));
        },function(rej){
          if(rej==1){//Incorrect password
            reject("Incorrect Username or Password");
          }
          else{
            console.log("No redis auth records, querying Simperium..");
            simperium.authorize(apiKey,appName,options.username,options.password)
            .then(function(user){
                authd.addUser(user.username,user.password,user.userId,appName);
                authd.addToken(user.userId,user.accessToken);
                authd.addApp(appName);            
                fulfill(user);
              },function(error){
                reject(error);
            });
          }
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
  return "ccid~"+ccid;
}
function currentKey(userId,bucketName){
    return userId+"-"+bucketName+"~current";
}
function cacheBucket(userId,bucketName,overwrite){
  return new Promise(function(fulfill,reject){
    simperium.getUserById(userId).getBucket(bucketName).getAll()
    .then(function(response){
      response.mark=undefined;
      return cache.cacheIndex(userId,bucketName,response,overwrite)
    },function(error){
      console.log("getall error",error);
    })
    .then(function(itemLength){
      simperium.getUserById(userId).getBucket(bucketName).itemCount=itemLength;
      fulfill();
    },function(error){
      log("cacheIndex error",error);
      reject(error);
    });
  });
}
function testData(downsync){
  return new Promise(function(fulfill,reject){
    var ary=[];
    cache.db.flushdb().then(function(res){
      console.log("DB flushed",res);
    })
    authorizeUser({username:testUsername
      ,password:testPassword
      ,appName:simperiumAppName
      ,apiKey:simperiumApiKey
    }).then(function(user){
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
function typeOf(input) {
	return ({}).toString.call(input).slice(8, -1).toLowerCase();
}
