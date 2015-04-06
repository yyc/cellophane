module.exports=function(){
  var json_diff=require("./jsondiff-node");
  var jd= new json_diff();
  var merge=require("./merge_recursively");
  mod={};
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
  mod.objectGet=function(userId,bucketName,objectId,objectVersion){
    return db.hgetall(itemKey(userId,bucketName,objectId,objectVersion));
  }
  mod.objectExists=function(userId,bucketName,objectId,objectVersion){
    return db.exists(itemKey(userId,bucketName,objectId,objectVersion));
  }
  mod.objectSet=function(userId,bucketName,objectId,data,options,ccid){
    var obj;
    return new Promise(function(fulfill,reject){
      db.multi();
      if(ccid){//if ccid is set, it's a simperium API call
        //check if change has been submitted before. ccid=client change id
        db.zscore(ccidsKey(userId,bucketName),ccid);
        //check for version numbers to determine whether I should overwrite
        db.hget(versionsKey(userId,bucketName),objectId);
        db.hgetall(itemKey(userId,bucketName,objectId));
        db.exec().then(function(response){
          if(response[0]||options.version<response[1]){
            //Change has already been made or is already outdated, fulfill with false for the success param
            if(options.response){
              fulfill(false,response[1],parseArray(response[2]));
            }else{
              fulfill(false,response[1]);
            }
          }
          db.multi();
          if(options.replace){
            obj={};
          }
          else{
            obj=response[2];
          }
          if(!options.version){
            //If version is not set then the latest version is updated
            options.version=response[1];
          }
          changeLog=(options||{});
          changeLog.d=data;
          changeLog.id=objectId;
          db.zadd(ccidsKey(userId,bucketName),response[1],ccid);
          db.set(ccidKey(ccid),JSON.stringify(changeLog));
          //if version is set, check that it is the same or greater than the one currently stored
          if(options.diffObj){
            //apply jsondiff merge
            obj=jd.apply_object_diff(obj,data);
          }
          else{
            //do a regular recursive merge
            merge(obj,data);
          }
          db.hmset(itemKey(userId,bucketName,objectId),obj);
          db.hmset(itemKey(userId,bucketName,objectId,response[1]*1+1),obj);
          db.hincrby(versionsKey(userId,bucketName),objectId,1);
          db.exec().then(function(response2){
            if(response2!=null){
              if(req.query.response){
                fulfill(true,response[1]*1+1,false);
              } else{
                fulfill(true,response[1]*1+1);
              }
            } else{
              reject("redis error");
            }
          },function(error){
            reject(error);
          }); 
        })
      }
    });
  }
  mod.cacheIndex=function(userId,bucketName,bucketIndex,overwrite){
    return new Promise(function(fulfill,reject){
      twinArray=[];
      if(overwrite){
        twinArray.push(purgeBucket(userId,bucketName));
      }
      var res=bucketIndex.index;
      var current=bucketIndex.current;
      Promise.all(twinArray).then(function(){
        versionHash={};
        indexHash={};
        if(res.length){
          db.multi();
          res.forEach(function(data){
            versionHash[data.id]=data.v;
            if(Object.keys(data.d).length){
              db.hmset(itemKey(userId,bucketName,data.id),data.d);
            } else{
              console.log("Skipping over "+itemKey(userId,bucketName,data.id)+" because it's an empty object");
            }
          });
          promiseArray=[];
          db.hmset(versionsKey(userId,bucketName),versionHash);
          db.del(ccidsKey(userId,bucketName));
          db.set(currentKey(userId,bucketName),current);
          db.exec().then(function(){
            console.log("Successfully cached "+res.length+" items in "+bucketName);
            fulfill(res.length);
          },function(error){
            console.log("Problem with caching"+error);
            reject(error);
          });
        } else{
          console.log(bucketName+" is empty, nothing cached.");
          fulfill(0);
        }
      },function(error){
        log("Problem with purging or getAll",error);
        reject(error);
      });
    });
  }
  mod.getIndex=function(userId,bucketName,options){
    return new Promise(function(fulfill,reject){
      var mark=options.mark || 0;
      var limit=options.limit || 100;
      db.hscan(versionsKey(userId,bucket),mark,{"count":limit})
      .then(function(keys){
        if(keys[0]&&keys[0]!=0){
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
              db.mget(keyArray.map(function(key){
                return itemKey(req.user.userId,req.params.bucket,key)
              })).then(function(objArray){
              for(i=0;i<keyArray.length;i++){
                  index.push({
                    id: keyArray[i]
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
                  id: keyArray[i]
                  , v: keys[1][keyArray[i]]
              });
              fulfill(index,mark);
            }
          }
        });
      },function(error){
          log("hgetall failed "+error);
          reject(error);
      })
      .then(function(index,mark){
        db.get(currentKey(req.user.userId,req.params.bucket)).then(function(curr){
          fulfill(index,curr,mark);
        });
      },function(error){
        log(error);
        reject(error);
      });
    });
  }
  
  mod.bucket=function(uid,bucket,subscribe){
    bucket={};
    var userId=uid;
    var bucketName=bucket;
    if(subscribe){
      
    }
    bucket.objectGet=function(objectId,objectVersion){
      return mod.objectGet(userId,bucketName,objectId,objectVersion);
    }
    return bucket;
  }
  return mod;
  function itemKey(userId,bucketName,itemId,objectVersion){
    if(objectVersion){
      return userId+"-"+bucketName+"-"+itemId+"~"+objectVersion;
    } else{
      return userId+"-"+bucketName+"-"+itemId+"";
    }
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
  function parseArray(array){
    hash={};
    for(i=0;i<array.length;i+=2){
      val=parseInt(array[i+1]);
      hash[array[i]]=isNaN(val)?array[i+1]:val;
    }
    return hash;
  }
}
