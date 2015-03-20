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
};
if(process.env.OPTIONS){
  merge(defaultOptions,JSON.parse(process.env.OPTIONS));
}
var options={};
merge(options,defaultOptions);

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
var versions=new DeferredStore("memory");

var notFound="<html><title>404: Not Found</title><body>404: Not Found</body></html>";

module.exports={
  start:start
  , app: app
  , test: testData
  };
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
var objectPost=function(req,res,next){
  db.multi();
}
app.route("/1/:appName/:bucket/index").all(apiAll).get(function(req,res,next){
  if(typeof simperium.getUserById(req.user.userId).getBucket(req.params.bucket).itemCount=="number"){
    var idSlice=req.user.userId.length+req.params.bucket.length+2;
    var mark=req.query.mark || 0;
    var limit=req.query.limit || 100;
    db.hscan(versionKey(req.user.userId,req.params.bucket),mark,{"count":limit})
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
        db.hmset(versionKey(req.user.userId,req.params.bucket),versionHash);
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

app.route("/1/:appName/:bucket/i/:object_id").all(apiAll).all(objectAll).get(objectPresent,objectGet).post(objectPost);
app.route("/1/:appName/:bucket/i/:object_id/v/:version").all(apiAll).all(objectAll).get(objectPresent,objectGet).post(objectPost);


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
    testData().then(function(user){
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
          bucketPromises=[];
          buckets=user.buckets;
          for(var key in buckets){
            bucketPromises.push(cacheBucket(userId,key,(payload[1]=="--overwrite")));
          }
          Promise.all(bucketPromises).then(function(){
            socket.emit("reply","Downsync complete");
/*
            store.keys(userId+"-*").then(function(ary){
              socket.emit("reply","listing follows");
              socket.emit("listing",ary);
            });
*/
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
function versionKey(userId,bucketName){
    return userId+"-"+bucketName+"~keys";
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
        db.hmset(versionKey(userId,bucketName),versionHash);
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
    db.hkeys(versionKey(userId,bucketName)).then(function(keys){
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
      if(downsync!="false"){
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