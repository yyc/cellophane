//Should only be spawned from index.js
if(!process.send){
  console.log("This is meant to be forked. Run 'node index.js' instead.");
  process.exit();
}


var redis=require("then-redis");
var simperium=require("./simperium");
var cachejs=require("./cache");

process.send("started");

process.on("message",function(message,httpListener){
  if(message=="http"){
    var io=require("socket.io")(httpListener);
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
      socket.on("init",function(payload){
        username=payload[0];
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
        
      console.log("io connection detected");
    })
  }
})
