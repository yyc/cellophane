process.env.NODE_ENV = 'test';
var express=require("express");
var app=express();
var router=express.Router();
var http=require("http");
var https=require("https");
var httpListener=http.Server(app);
var io=require("socket.io")(httpListener);
var DeferredStore=require("object-store").DeferredStore;

var simperium=require("./simperium");
var merge=require("./merge_recursively")
var configs=require("./config.js");
var simperiumAppName =configs.appName;
var simperiumApiKey = configs.apiKey;
var testUsername=configs.username;
var testPassword=configs.password;
var port = configs.port;

var captureTokens={};
var activeUsers={};
var defaultOptions={stickyAttendance:false
  , simperiumSync:true
  , storageMethod:"redis"
};
if(process.env.OPTIONS){
  merge(defaultOptions,JSON.parse(process.env.OPTIONS));
}
var options={};
merge(options,defaultOptions);

var store=new DeferredStore(options.storageMethod);


module.exports={
  start:start
  , app: app
  , test: testData
  };
function start(done){


//Middleware for accessing buckets
var objectAll=function(req,res,next){
  if(!req.headers["x-simperium-token"]){
    res.statusCode=401;
    res.statusMessage = "Unauthorized";
    res.end("401 Unauthorized: Missing Token");
  }else{
    if(captureTokens[req.headers["x-simperium-token"]]){
      req.user=simperium.getUserByToken(req.headers["x-simperium-token"],captureTokens[req.headers["x-simperium-token"]]);
      if(req.user){
        req.bucket=req.user.getBucket(req.params.bucket);
      }
      else{
        req.user = simperium.init(req.appName,captureTokens[req.headers['x-simperium-token']],req.headers['x-simperium-token']);
        req.bucket=req.user.getBucket(req.params.bucket);
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
app.route("/1/:appName/buckets").get(function(req,res,next){
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
  } else{
    res.statusCode=401;
    res.statusMessage = "Unauthorized";
    res.end("401 Unauthorized: Missing Token");
}
});
//Getting Requests to auth.simperium.com
app.route("/1/:appName/:method/").all(function(req,res,next){//Main router
  req.appName=req.params.appName;
  req.action=req.params.method;
  if(req.headers['x-simperium-token']){
    res.redirect(301,"buckets");
    res.end();
  }else{
    next();
  }
}).get(function(req,res,next){
  log("GET request detected");
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
        authorizeUser(authOptions,function(err,user){
          if(!err){
            response=JSON.stringify({
              username:user.username,
              access_token: user.accessToken,
              userid: user.userId
            });
            res.end(response);
          } else{
            res.statusCode=400;
            res.end("Error")
          }
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

app.route("/1/:appName/:bucket/index").all(objectAll).get(function(req,res,next){
  if(false){
    //Handle caching

  }else{
    log("getting index");
    options.format="text";
    req.bucket.index(function(err,response,extra){
      if(err){
        log(err,response);
        res.statusCode=500;
        res.end(response);
      }else{
        res.statusCode=200;
        res.end(JSON.stringify({
          current:extra.current
          ,index:response}));
      }
    },options);
    
  }
})

var objectGet=function(req,res,next){
  
}

var objectPost=function(req,res,next){
  
}

app.route("/1/:appName/:bucket/i/:object_id").all(objectAll);
app.route("/1/:appName/:bucket/i/:object_id/v/:version").all(objectAll);

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
          userStores[userId]={};
          for(var key in user.buckets){
            userStores[userId][key]=new DeferredStore(options[storageMethod]);
          }
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
        socket.emit("error","Username not found! Please use the add <username> <password> command first");
      }
    }
  });
  socket.on("test",function(payload){
    testData().then(function(user){
      socket.emit("reply","user created and authorized: (token "+user.accessToken+")");
    },function(error){
      socket.emit("reply","error authorizing user");
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
      if([payload[1]]=="--overwrite"){
        //overwrite
      } else{
        //don't overwrite
      }
    }else{
      socket.emit("error","upsync requires options");
    }
  });//incomplete
  socket.on("downsync",function(payload){
    if(payload[0]){
      if(activeUsers[payload[0]]){
        userId=activeUsers[payload[0]];
       var user=simperium.getUserById(userId);
        if(user){
          buckets=user.buckets;
          var bucketPromises=[delayedPromise(1000)];
          for(var key in buckets){
            var bucketName=key;
            var indexPromises=[delayedPromise(1000)];
            if([payload[1]]=="--overwrite"){
              buckets[bucketName].index(function(err,res){
                if(!err){
                  log("retrieved index",res);
                  store.keys(userId+"-"+key+"-*").then(function(data){
                    for(var i=0;i<data.length;i++){
                      promise=store.del(data[i]);
                      indexPromises.push(promise);
                      bucketPromises.push(promise);
                    }
                    return indexPromises;
                  }).then(function(promiseArray){
                    Promise.all(promiseArray).then(function(data){
                      promiseArray=[];
                      log("Deleted all values in bucket",data);
                      res.forEach(function(data){
                        socket.emit("reply","Pushing "+data.d+" into "+userId+"-"+bucketName+"-"+data.id);
                        promiseArray.push(store.set(userId+"-"+bucketName+"-"+data.id,data.d));
                      });
                      bucketPromises.push(Promise.all(promiseArray));
                    });
                  });}
              },{data:true});
            } else{
              
            }
          }
          Promise.all(bucketPromises).then(function(){
            log("Downsync complete");
            store.keys(userId+"-*").then(function(ary){
              socket.emit("reply","listing follows");
              socket.emit("listing",ary);
            });
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


httpListener.listen(port,function(){
  if(done){
    done();
  }
});

}
start(function(){
  log("Listening on port ",port);
});
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

function authorizeUser(options,callback){
  apiKey = options.apiKey || simperiumApiKey;
  appName = options.appName || simperiumAppName;
  if(options.username){
    if(activeUsers[options.username]){
      user=simperium.getUserById(activeUsers[options.username]);
      if(user){
        callback(false,user);
      } else{
        var requestString="";
          simperium.authorize(apiKey,appName,options.username,options.password,function(error,user){
            if(error){
              callback(true,user);
            }else{
              callback(false,user);
            }
          });
      }
    }
    else{
//For production can just make this pass through. Or maybe not? Would be useful to capture all auth data.
      var requestString="";
        simperium.authorize(apiKey,appName,options.username,options.password,function(error,user){
          if(error){
            callback(true,user);
          }else{
            callback(false,user);
          }
        });
    }
  } else{
    callback(true,"Missing username");
  }
}

function testData(){
  return new Promise(function(fulfill,reject){
    authorizeUser({username:testUsername
      ,password:testPassword
      ,appName:simperiumAppName
      ,apiKey:simperiumApiKey
    },function(err,user){
      if(!err){
        accessToken=user.accessToken
        captureTokens[accessToken]=user.userId;
        activeUsers[testUsername]=user.userId;
        captureTokens[accessToken]=activeUsers[testUsername];
        fulfill(user);
      }
      else{
        reject(true);
      }
    });
  })
}