var json_diff=require("./jsondiff-node");
var jd= new json_diff();
var merge=require("./merge_recursively");
var EventEmitter=require("events").EventEmitter;
var util=require("util");
var redis=require("then-redis");
var md5=require("MD5");

module.exports={
  Cache:Cache,
  Bucket:Bucket,
  Connection:Connection
  };

function Cache(){
  this.eventMessages={};
  this.db=redis.createClient();
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
Cache.prototype.exit=function(){
  //close redis connection
  db.quit();
}
Cache.prototype.objectGet=function(userId,bucketName,objectId,objectVersion){
  return db.get(itemKey(userId,bucketName,objectId,objectVersion)).then(function(response){
    return Promise.resolve(JSON.parse(response));
  });
}
Cache.prototype.objectExists=function(userId,bucketName,objectId,objectVersion){
  return db.exists(itemKey(userId,bucketName,objectId,objectVersion));
}
Cache.prototype.objectSet=function(userId,bucketName,objectId,data,options,ccid){
  var obj;
  return new Promise(function(fulfill,reject){
    db.multi();
    if(ccid){//if ccid is set, it's a simperium API call
      //check if change has been submitted before. ccid=client change id
      db.zscore(ccidsKey(userId,bucketName),ccid);
      //check for version numbers to determine whether I should overwrite
      db.hget(versionsKey(userId,bucketName),objectId);
      db.get(itemKey(userId,bucketName,objectId));
      db.get(currentKey(userId,bucketName));
      db.exec().then(function(response){
        if(response[0]||options.version<response[1]){
          //Change has already been made or is already outdated, fulfill with false for the success param
          if(options.response){
            fulfill(false,response[1],JSON.parse(response[2]));
          }else{
            fulfill(false,response[1]);
          }
          if(!response[0]){
            //record change anyway
            changeLog=(options||{});
            changeLog.c=true;//conflict
            changeLog.d=data;
            changeLog.id=objectId;
            db.zadd(ccidsKey(userId,bucketName),response[1],ccid);
            db.set(ccidKey(ccid),JSON.stringify(changeLog));
          }
        }
        else{
          db.multi();
          if(options.replace){
            obj={};
          }
          else{
            obj=JSON.parse(response[2]);
          }
          if(!options.version){
            //If version is not set then the latest version is updated
            options.version=response[1];
          }
          changeLog=(options||{});
          changeLog.c=false; //no conflicts
          changeLog.id=objectId;
          changeLog.sv=response[1];
          changeLog.cv=md5(response[3]);
          //if version is set, check that it is the same or greater than the one currently stored
          if(options.diffObj){
            //apply jsondiff merge
            obj=jd.apply_object_diff(obj,data);
            changeLog.d=data;
          }
          else{
            //do a regular recursive merge
            merge(obj,data);
            //add changeobject to changelog
            changeLog.d=jd.object_diff(obj,data);
          }
          db.zadd(ccidsKey(userId,bucketName),response[1],ccid);
          db.set(ccidKey(ccid),JSON.stringify(changeLog));
          db.set(itemKey(userId,bucketName,objectId),JSON.stringify(obj));
          db.set(itemKey(userId,bucketName,objectId,response[1]*1+1),JSON.stringify(obj));
          db.hincrby(versionsKey(userId,bucketName),objectId,1);
          db.publish(channelKey(userId,bucketName),JSON.stringify(merge({
            "id": objectId
            , "o": "M"
            , "v": changeLog.d
            , "ev": response[1]
            , "ccids": [ccid]
          },changeLog)));
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
Cache.prototype.objectDelete=function(userId,bucketName,objectId,version,ccid){
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
Cache.prototype.cacheIndex=function(userId,bucketName,bucketIndex,overwrite){
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
            db.set(itemKey(userId,bucketName,data.id),JSON.stringify(data.d));
          } else{
            console.log("Skipping over "+itemKey(userId,bucketName,data.id)+" because it's an empty object");
          }
        });
        promiseArray=[];
        db.hmset(versionsKey(userId,bucketName),versionHash);
        db.del(ccidsKey(userId,bucketName));
        if(!bucketIndex.mark){//only set currentKey if the cache is complete
          db.set(currentKey(userId,bucketName),current);
        }
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
Cache.prototype.getIndex=function(userId,bucketName,options){
  return new Promise(function(fulfill,reject){
    var mark=options.mark || 0;
    var limit=options.limit || 100;
    db.hscan(versionsKey(userId,bucketName),mark,{"count":limit})
    .then(function(keys){
      if(keys[0]&&keys[0]!=0){
        mark=keys[0];
      }
      else{
        mark=undefined;
      }
      return new Promise(function(fulfill,reject){
        var index=[];
        if(options.data=="true"||options.data==true||options.data==1){
          if(Object.keys(keys[1]).length){
            keyArray=Object.keys(keys[1]);
            db.mget(keyArray.map(mapItemKey(userId,bucketName))).then(function(objArray){
            for(i=0;i<keyArray.length;i++){
              if(objArray[i]&&objArray[i]!="null"){
                index.push({
                  id: keyArray[i]
                  , d: JSON.parse(objArray[i])
                  , v: keys[1][keyArray[i]]
                });
              }
            }
            fulfill([index,mark]);
            },function(error){
              console.log("Error retrieving objects")
              reject(error);
            });
          } else{
          fulfill([index,mark]);
          }
        }
        else{
          if(Object.keys(keys[1]).length){
            keyArray=Object.keys(keys[1]);
            for(i=0;i<keyArray.length;i++){
              index.push({
                  id: keyArray[i]
                  , v: keys[1][keyArray[i]]
              });
              fulfill([index,mark]);
            }
          }
          else{
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
Cache.prototype.addBucket=function(userId,bucketName){
  return new Bucket(userId,bucketName);
}

function Bucket(uid,bucket,cache){
  this.userId=uid;
  this.bucketName=bucket;
  this.cache=new Cache();
}
Bucket.prototype.objectGet=function(objectId,objectVersion){
  return this.cache.objectGet(this.userId,this.bucketName,objectId,objectVersion);
}
Bucket.prototype.objectSet=function(objectId,data,options,ccid){
  return this.cache.objectSet(this.userId,this.bucketName,objectId,data,options,ccid);
}
Bucket.prototype.objectDelete=function(objectId,objectVersion,ccid){
  return this.cache.objectGet(this.userId,this.bucketName,objectId,objectVersion,ccid);
}
Bucket.prototype.cacheIndex=function(bucketIndex,overwrite){
  return this.cache.cacheIndex(this.userId,this.bucketName,bucketIndex,overwrite);
}
Bucket.prototype.getIndex=function(options){
  return this.cache.getIndex(this.userId,this.bucketName,options);
}

function Connection(){//Each connection should have its own individual subscription
  EventEmitter.call(this);
  if (process.env.REDISTOGO_URL) {
    var rtg   = require("url").parse(process.env.REDISTOGO_URL);
    this.rd = redis.createClient(rtg.port, rtg.hostname);
    db.auth(rtg.auth.split(":")[1]);
  } else {
    this.rd=redis.createClient();
  }
  this.rd.on("message",function(channel,message){
    console.log(message);
    this.emit(channel,message);
  });
}
util.inherits(Connection,EventEmitter);
Connection.prototype.subscribe=function(userId,bucketName){
  this.rd.subscribe(channelKey(userId,bucketName)).then(function(response){
    console.log("Subscription to "+response);
  });
  return channelKey(userId,bucketName);
}
Connection.prototype.exit=function(){
  this.rd.quit();
}

function itemKey(userId,bucketName,itemId,objectVersion){
  if(objectVersion){
    return userId+"-"+bucketName+"-"+itemId+"~"+objectVersion;
  } else{
    return userId+"-"+bucketName+"-"+itemId+"";
  }
}
function mapItemKey(userId,bucketName){
  return function(objectId){
    return itemKey(userId,bucketName,objectId);
  }
}
function versionsKey(userId,bucketName){
    return userId+"-"+bucketName+"~keys";
}
function ccidsKey(userId,bucketName){
    return userId+"-"+bucketName+"~ccids";
}
function ccidKey(ccid){
  return "ccid~"+ccid;
}
function currentKey(userId,bucketName){
    return userId+"-"+bucketName+"~current";
}
function channelKey(userId,bucketName){
  return userId+"-"+bucketName;
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

