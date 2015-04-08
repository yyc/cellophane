var json_diff=require("./jsondiff-node");
var jd= new json_diff();
var merge=require("./merge_recursively");
var EventEmitter=require("events").EventEmitter;
var redis=require("then-redis");

module.exports=cache;

function cache(){
};
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
cache.prototype.exit=function(){
  //close redis connection
  db.quit();
}
cache.prototype.objectGet=function(userId,bucketName,objectId,objectVersion){
  return db.hgetall(itemKey(userId,bucketName,objectId,objectVersion));
}
cache.prototype.objectExists=function(userId,bucketName,objectId,objectVersion){
  return db.exists(itemKey(userId,bucketName,objectId,objectVersion));
}
cache.prototype.objectSet=function(userId,bucketName,objectId,data,options,ccid){
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
          if(!response[0]){
            //record change anyway
            changeLog=(options||{});
            changeLog.d=data;
            changeLog.id=objectId;
            db.zadd(ccidsKey(userId,bucketName),response[1],ccid);
            db.hmset(ccidKey(ccid),JSON.stringify(changeLog));
          }
        }
        else{
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
          changeLog.v=response[1];
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
              fulfill([true,response[1]*1+1,obj]);
            } else{
              reject("redis error");
            }
          },function(error){
            reject(error);
          });
        }
      })
    } else{
      //no ccid, just cache the object and update versions
    }
  });
}
cache.prototype.objectDelete=function(userId,bucketName,objectId,version,ccid){
  return new Promise(function(fulfill,reject){
    //assumes that the object already exists, since the Exists call should've been run as middleware
    if(ccid){//if ccid is set, it's a simperium API call
      db.multi();
      //check if change has been submitted before. ccid=client change id
      db.zscore(ccidsKey(userId,bucketName),ccid);
      //check for version numbers to determine whether I should overwrite
      db.hget(versionsKey(userId,bucketName),objectId);
      db.exec().then(function(response){
        if(response[0]){//change already made
          fulfill([response[1],412]);
        } else if(version&&version!=response[1]){//have to check versions, DELETE only goes through if the version number matches the current one
            fulfill([response[1],412]);
        }
        else{
          changeLog={delete:true,v:response[1]};
          db.multi();
          db.zadd(ccidsKey(userId,bucketName),response[1],ccid);
          db.set(ccidKey(ccid),JSON.stringify(changeLog));
          db.del(itemKey(userId,bucketName,objectId));
          db.hincrby(versionsKey(userId,bucketName),objectId,1);
          db.exec().then(function(response2){
            console.log(response2);
            fulfill([response2[3],200])
          });
        }
      });
    }
    else{
      //ccid not set, delete without logging
      db.multi();
      db.del(itemKey(userId,bucketName,objectId));
      db.hincrby(versionsKey(userId,bucketName),objectId,1);
      db.exec().then(function(response2){
        fulfill([response2[3],200])
      });
    }
  });
}
cache.prototype.cacheIndex=function(userId,bucketName,bucketIndex,overwrite){
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
          reject("Problem with caching");
        });
      } else{
        console.log(bucketName+" is empty, nothing cached.");
        fulfill(0);
      }
    },function(error){
      console.log("Problem with purging",error);
      reject("Problem with purging");
    });
  });
}
cache.prototype.getIndex=function(userId,bucketName,options){
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
        if(options.data=="true"||options.data==1){
          if(Object.keys(keys[1]).length){
            keyArray=Object.keys(keys[1]);
            db.mget(keyArray.map(function(key){
              return itemKey(userId,bucketName,key);
            })).then(function(objArray){
            for(i=0;i<keyArray.length;i++){
                index.push({
                  id: keyArray[i]
                  , d: objArray[i]
                  , v: keys[1][keyArray[i]]
                });
              }
              fulfill([index]);
            },function(error){
              console.log("Error retrieving objects")
              reject(error);
            });
          } else{
          fulfill([index,mark]);
          }
        }
        else{
          for(i=0;i<keyArray.length;i++){
            index.push({
                id: keyArray[i]
                , v: keys[1][keyArray[i]]
            });
            fulfill([index,mark]);
          }
        }
      });
    },function(error){
        reject(error);
    })
    .then(function(res){
      db.get(currentKey(userId,bucketName)).then(function(curr){
        fulfill([res[0],curr,res[1]]);
      });
    },function(error){
      reject(error);
    });
  });
}

cache.prototype.bucket=function(uid,bucket){
  var userId=uid;
  var bucketName=bucket;
  var bucket=this;
  EventEmitter.call(this);
  console.log(this);
  db.subscribe(userId+"-"+bucketName);
  db.on("message",function(channel,message){
    if(channel==userId+"-"+bucketName){
      bucket.emit("message",message);
    }
  });
}
cache.prototype.bucket.prototype.objectGet=function(objectId,objectVersion){
  return objectGet(this.userId,this.bucketName,objectId,objectVersion);
}
cache.prototype.bucket.prototype.objectSet=function(objectId,data,options,ccid){
  return objectSet(this.userId,this.bucketName,objectId,data,options,ccid);
}
cache.prototype.bucket.prototype.objectDelete=function(objectId,objectVersion,ccid){
  return objectGet(this.userId,this.bucketName,objectId,objectVersion,ccid);
}
cache.prototype.bucket.prototype.cacheIndex=function(bucketIndex,overwrite){
  return cacheIndex(this.userId,this.bucketName,bucketIndex,overwrite);
}
cache.prototype.bucket.prototype.getIndex=function(options){
  return getIndex(this.userId,this.bucketName,bucketIndex,overwrite);
}
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
function purgeBucket(userId,bucketName){
  return new Promise(function(fulfill,reject){
    db.hkeys(versionsKey(userId,bucketName)).then(function(keys){
      if(keys.length){
        db.del(keys).then(function(){
          console.log("Deleted all values in bucket",bucketName);
          fulfill();
        },function(error){
          reject(error)
        });
      }
      else{
        console.log(bucketName+" was empty, fulfilled automatically");
        fulfill();
      }
    });
  });
}  
function typeOf(input) {
	return ({}).toString.call(input).slice(8, -1).toLowerCase();
}

