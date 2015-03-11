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



/*
var simperiumAppName = process.env.SIMPERIUM_APP_ID || "miles-secretaries-5c5";
var simperiumApiKey = process.env.SIMPERIUM_API_KEY || "11afb5edc0b74c75b21518654f960d5f";
*/
var simperiumAppName = process.env.SIMPERIUM_APP_ID || "photo-wages-1b6";
var simperiumApiKey = process.env.SIMPERIUM_API_KEY || "59d266d2e77d4c89a39fad5172a5f3f7";
var port = process.env.PORT || 5000;

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


var authorizeUser = function(options,callback){
  apiKey = options.apiKey || simperiumApiKey;
  appName = options.appName || simperiumAppName;
  var requestString="";
    simperium.authorize(apiKey,appName,options.username,options.password,function(error,user){
      if(error){
        callback(true,user);
      }else{
        callback(false,user);
      }
    });
}

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

//Getting auth Requests
app.route("/1/:appName/:method/").all(function(req,res,next){//Main router
  req.appName=req.params.appName;
  req.action=req.params.method;
  if(req.headers['x-simperium-token']){
    //This route should only match the api.simperium.com/1/appName/buckets method
    if(captureTokens[req.headers['x-simperium-token']]){
      //capture
      if(req.action="buckets"){
         var user=simperium.getUserByToken(req.headers["x-simperium-token"],captureTokens[req.headers["x-simperium-token"]]);
        if(user){
          buckets=user.buckets;
          response={};
          response.buckets=buckets;
          res.end(JSON.stringify(response));
        }else{
          user = simperium.init(req.appName,captureTokens[req.headers['x-simperium-token']],req.headers['x-simperium-token']);
          user.bucketList(user,function(err,response){
            if(!err){
              res.end(response);
            }else{
              res.end(response);
              log(response);
            }
          });
        }
      }
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
  }else{
    next();
  }
}).get(function(req,res,next){
  console.log("GET request detected");
  next();
}).post(function(req,res,next){
  console.log("POST request detected");
  //Only authorize is of any interest, we can let the rest through without parsing
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
  else{
    var options = {
      hostname: "auth.simperium.com",
      path: req.url,
      method: req.method || "POST",
      headers: {"x-simperium-token":req.headers['x-simperium-api-key']}
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
        res.end(response);
      }
    },options);
    
  }
})




var objectGet=function(req,res,next){
  
}

function objectPost(req,res,next){
  
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
    authorizeUser({username:"yyc478@gmail.com"
      ,password:"password"
      ,appName:"photo-wages-1b6"
      ,apiKey:"59d266d2e77d4c89a39fad5172a5f3f7"
    },function(err,user){
      if(!err){
        socket.emit("reply","user created and authorized: (token "+user.accessToken+")");
        captureTokens[user.accessToken]=user.userId;
        activeUsers["yyc478@gmail.com"]=user.userId;
        accessToken="c8ae12b2a8ab485a9b0effd3c9100866";
        captureTokens[accessToken]=activeUsers["yyc478@gmail.com"];
        socket.emit("reply","Successfully associated token");
      }
      else{
        socket.emit("reply","error authorizing user");
      }
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
  console.log("io connection detected");
})


httpListener.listen(port,function(){
  log("Listening on port ",port);
});

function passthrough(opts,req,res,callback){
    //don't capture
  log("Passing along request by "+(req.headers['x-simperium-token']||req.headers['x-simperium-api-key'])+" to "+opts.path);
  var options = {
    hostname: "api.simperium.com",
    port: 443,
    method: "GET"
  };
  merge(options,opts);
  console.log(req.method);
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
      for(var key in objects){
        message+=" "+JSON.stringify(objects[key]);
      }
    }
    else{
      message+=" "+JSON.stringify(objects);
    }
  }
  console.log(message);
  io.emit("message",message);
}

function delayedPromise(ms){ // quick promisified delay function
    return new Promise(function(r){setTimeout(r,ms);});
}

