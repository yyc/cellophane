var express=require("express");
var https=require("https");
var simperium;
var uuid=require("node-uuid");
var merge=require("./lib/merge_recursively");

module.exports=function(configs,cache,authd){
  var app=express();

  //Getting all auth requests and /buckets (since they match the same route pattern
  app.route("/1/:appName/:method/").all(function(req,res,next){//Main router
    req.appName=req.params.appName;
    req.action=req.params.method;
    if(req.headers['x-simperium-token']){
      //This route should only match the api.simperium.com/1/appName/buckets method
      apiAll(req,res,next);
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
      var authString="";
      req.on("data",function(data){
        authString+=data;
      }).on("end",function(){
        var json=JSON.parse(authString);
        console.log(json);
        authd.authorize(json.username,json.password,req.appName,req.headers['x-simperium-api-key'])
        .then(function(user){
            req.user=user;
            res.end(JSON.stringify({
                username:req.user.username,
                access_token: req.user.accessToken,
                userid: req.user.userId
            }));
          },function(error){
            console.error("Authorize error",error);
        })
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
  }).all(function(req,res,next){
    res.statusCode=501;
    res.end("501 Not Implemented");
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
      authd.getUserByToken(req.headers["x-simperium-token"]).then(function(user){
        if(user){
          req.user=user;
          if(req.params.bucket){
            req.bucket=user.getBucket(req.params.bucket);
          }
          next();
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
      },function(error){
        console.log("ApiAll token resolution error",error);
        var options = {
          hostname: "api.simperium.com",
          path: req.url,
          method: req.method || "GET",
          headers: {"x-simperium-token":req.headers['x-simperium-token']}
        };
        passthrough(options,req,res);
      });
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
         authd.getUserById(req.user.userId).getBucket(req.params.bucket).itemRequest(req.params.object_id,req.method,req.params.version)
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
    if(typeof req.bucket.itemCount=="number"){
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
      req.bucket.index(options)
      .then(function(response){
        res.statusCode=200;
        res.end(JSON.stringify(response));
      //Store everything in the cache
        if(options.data){
          cache.cacheIndex(req.user.userId,req.params.bucket,response.index,false).then(function(indexCount){
            oldCount=parseInt(req.user.getBucket(json.name).itemCount)||0;
            if(!response.mark){
              console.log("Cache complete, stored "+indexCount+" items");
              req.user.getBucket(json.name).itemCount=oldCount+indexCount;
            }
            else{
              console.log("Cache incomplete, stored "+indexCount+" items");
              authd.getUserById(user).getBucket(json.name).itemCount=""+(oldCount+indexCount);
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
    console.log(req.user.getBucket(req.params.bucket));
    if(typeof req.user.getBucket(req.params.bucket).itemCount=="number"){
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
  app.route("/sock/1/:app_id/info").get(function(req,res,next){
      //Hacky way to imitate the /info handshake. Basically just tells the client that it's okay to connect to any random path under this one. If there are a significant number of users then I'd have to actually keep track of the entropy to prevent colliding sockets.
    prefixUrl=req.url.slice(0,-5);
      res.end(JSON.stringify({"websocket":true,"origins":["*:*"],"cookie_needed":false,"entropy":(Math.random()*1000000000)}));
  });

  return app;
  
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
      authd.getUserById(userId).getBucket(bucketName).getAll()
      .then(function(response){
        response.mark=undefined;
        return cache.cacheIndex(userId,bucketName,response,overwrite)
      },function(error){
        console.log("getall error",error);
      })
      .then(function(itemLength){
        authd.getUserById(userId).getBucket(bucketName).itemCount=itemLength;
        fulfill();
      },function(error){
        console.log("cacheIndex error",error);
        reject(error);
      });
    });
  }
  function testData(downsync){
    return new Promise(function(fulfill,reject){
      var ary=[];
      cache.db.flushdb().then(function(res){
        console.log("DB flushed",res);
        return authd.authorize(configs.testParams.username,configs.testParams.password,configs.appName,configs.apiKey);
      })
      .then(function(user){
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
  function passthrough(opts,req,res,callback){
      //don't capture
    console.log("Passing along request by "+(req.headers['x-simperium-token']||req.headers['x-simperium-api-key'])+" with options",opts);
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
}
