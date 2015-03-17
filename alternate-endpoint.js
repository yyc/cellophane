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
var versions=new DeferredStore("memory");

module.exports={
  start:start
  , app: app
  , test: testData
  };
function start(done){



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
var objectAll=function(req,res,next){
  if(!req.params.object_id){
    res.statusCode=404;
    res.end("<html><title>404: Not Found</title><body>404: Not Found</body></html>");
  } else{
    next();
  }
}
var objectGet=function(req,res,next){
  var objectId=req.params.object_id;
  if(req.params.version){
    var objectVersion=req.params.version;
  }
  store.get(itemKey(req.user.userId,req.bucket.bucketName,objectId)).then(function(response){
    if(response){
      
    }
  });
  
}

var objectPost=function(req,res,next){
  
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
app.route("/1/:appName/:bucket/index").all(bucketAll).get(function(req,res,next){
  if(typeof req.bucket.itemCount=="number"){
    log("Cached already exists?");
    var index=[];
    store.keys(itemKey(req.user.userId,req.bucket.bucketName))
    .then(function(keys){
      var promiseArray=[];
      keys.forEach(function(key){
        promiseArray.push(store.get(key).then(function(object){
          return new Promise(function(fulfill,reject){
            index.push({
              id: key
              , d: object
            });
            fulfill();
          });
        }));
      });
      return Promise.all(promiseArray);
    })
    .then(function(response){
      res.end(JSON.stringify({
        index:index
        }));
    },function(error){
      res.statusCode=500;
      res.end(error);
    });
  }else{
    options=req.query;
    req.bucket.index(options)
    .then(function(response){
      res.statusCode=200;
      res.end(JSON.stringify(response));
      console.log("After",req.bucket.itemCount);
    //Store everything in the cache
      if(options.data){
        for(i=0;i<response.index.length;i++){
          if(response.index[i].d){
            store.set(itemKey(req.user,req.bucket,response.index[i].id),response.index[i].d)
            .then(function(success){
            },function(error){
            });
          }
        }
      }
    },function(err){
      log(err);
      res.statusCode=500;
      res.end(err);
    });
  }
});

app.route("/1/:appName/:bucket/i/:object_id").all(bucketAll).all(objectAll).get(objectGet);
app.route("/1/:appName/:bucket/i/:object_id/v/:version").all(bucketAll).all(objectAll).get(objectGet);


//Admin routes
app.route("/admin/test").all(function(req,res,next){
  testData().then(function(user){
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
      }
      authorizeUser({username:username
        ,password:password
        ,appName:appName
        ,apiKey:apiKey
      }).then(function(user){
        socket.emit("reply","user created and authorized: (token "+user.accessToken+")");
        captureTokens[user.accessToken]=user.userId;
        activeUsers[username]=user.userId;
        userStores[userId]={};
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
          socket.emit("reply","error authorizing user");
      });
    }
  });
  socket.on("store",function(payload){
    switch(payload[0]){
      case "flush":
        store.flush().then(function(success){
          socket.emit("reply","Store successfully flushed");
        },function(error){
          socketemit("error","couldn't flush store"+error);
        });
      break;
      case "keys":
        store.keys(payload[1]).then(function(response){
          socket.emit("reply","Keys follow");
          socket.emit("listing",response);
        },function(error){
          socketemit("error","couldn't get listing store"+error);
        });      
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
  itemId = itemId || "*";
  return userId+"-"+bucketName+"-"+itemId+"";
}


function cacheBucket(userId,bucketName,overwrite){
  return new Promise(function(fulfill,reject){
    twinArray=[];
    if(overwrite){
      twinArray.push(purgeBucket(userId,bucketName));
    }
    var res;
    twinArray.push(simperium.getUserById(userId).getBucket(bucketName).getAll().then(function(response){
      res=response.index;
      return Promise.resolve();
    },function(error){
      return Promise.reject();
    }));
    Promise.all(twinArray).then(function(){
      promiseArray=[];
      res.forEach(function(data){
        promiseArray.push(store.set(itemKey(userId,bucketName,data.id),data.d));
      },function(error){
        log("error pushing",error);
      });
      Promise.all(promiseArray).then(function(){
        log("Successfully cached "+res.length+" items in "+bucketName);
        simperium.getUserById(userId).getBucket(bucketName).itemCount=res.length;
        fulfill();
      });
    },function(error){
      log("problem with getAll",error);
      reject(error);
    });
  });
}
function purgeBucket(userId,bucketName){
  return new Promise(function(fulfill,reject){
    indexPromises=[];
    store.keys(itemKey(userId,bucketName,"*"),true).then(function(keys){
      for(var i=0;i<keys.length;i++){
        indexPromises.push(store.del(keys[i]));
        log("Deleting",keys[i]);
      }
      Promise.all(indexPromises).then(function(){
        log("Deleted all values in bucket",bucketName);
        fulfill();
      },function(error){
        reject(error)
      });
    });
  });
}
function testData(){
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
/*
      for(var key in user.buckets){
        ary.push(cacheBucket(user.userId,key,true));
      }
*/
      Promise.all(ary).then(function(response){
        fulfill(user);
      },function(error){
        reject(error);
        log(error);
      });
    });
  });
}