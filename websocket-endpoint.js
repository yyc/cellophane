module.exports=function(configs,cache,authd){
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
}