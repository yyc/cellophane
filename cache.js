var json_diff=require("./jsondiff-node");
var jd= new json_diff();
var merge=require("./merge_recursively");
var EventEmitter=require("events").EventEmitter;
var util=require("util");
var redis=require("then-redis");
var md5=require("MD5");

module.exports={
  Auth:Auth,
  Cache:Cache,
  Bucket:Bucket
  };

function Auth(){
  this.db=redis.createClient();
}
Auth.prototype.getApps=function(){
  return this.db.smembers("~apps");
}
Auth.prototype.addApp=function(appName){
  return this.db.sadd("~apps",appName);
}
Auth.prototype.getUsers=function(){
  return this.db.hkeys("~users");
}
Auth.prototype.getUser=function(access_token){
  return this.db.hget("~accessTokens",access_token);
}
Auth.prototype.addUser=function(username,password,userId,appName){
  return this.db.hset("~users",username,JSON.stringify({password:password,userId:userId,appName:appName}));
}
Auth.prototype.authorize=function(username,password){
  var self=this;
  return this.db.hget("~users",username).then(function(res){
    if(res){
      var json=JSON.parse(res);
      if(password==json.password){
        delete json.password;
        return self.db.hget("~userTokens",userId).then(function(accessToken){
          json.accessToken=accessToken;
          return Promise.resolve(json);
        });
      }
      else{
        Promise.reject(1);
      }
    }
    else{
      return Promise.reject(0);
    }
  });
}
Auth.prototype.addToken=function(userId,token){
  var self=this;
  return this.db.hset("~accessTokens",token,userId).then(function(){
      return self.db.hset("~userTokens",userId,token);
    });
  
}
Auth.prototype.exit=function(){
  this.db.quit();
}

function Cache(clientid){
  this.clientid=clientid || "cellodaemon";
  this.eventMessages={};
  this.db=redis.createClient();  
};
if (process.env.REDISTOGO_URL) {
  var rtg = require("url").parse(process.env.REDISTOGO_URL);
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
  this.db.quit();
}
Cache.prototype.bucketList=function(userId){
  return this.db.smembers(bucketsKey(userId));
}
Cache.prototype.bucketCount=function(userId,bucketName){
  return this.db.hlen(versionsKey(userId,bucketName)).then(function(itemCount){
    return Promise.resolve([bucketName,itemCount])
  });
}
Cache.prototype.objectGet=function(userId,bucketName,objectId,objectVersion){
  return this.db.get(itemKey(userId,bucketName,objectId,objectVersion)).then(function(response){
    if(response==null && objectVersion){
      return this.db.get(itemKey(userId,bucketName,objectId)).then(function(response){
        return Promise.resolve(JSON.parse(response));        
      });
    } else{
      return Promise.resolve(JSON.parse(response));
    }
  });
}
Cache.prototype.objectExists=function(userId,bucketName,objectId,objectVersion){
  return this.db.exists(itemKey(userId,bucketName,objectId,objectVersion));
}
Cache.prototype.objectSet=function(userId,bucketName,objectId,data,options,ccid){
  var obj;
  self=this;
  return new Promise(function(fulfill,reject){
    self.db.multi();
    if(ccid){//if ccid is set, it's a simperium API call
      //check if change has been submitted before. ccid=client change id
      self.db.zscore(ccidVersionsKey(userId,bucketName),ccid);
      //check for version numbers to determine whether I should overwrite
      self.db.hget(versionsKey(userId,bucketName),objectId);
      self.db.get(itemKey(userId,bucketName,objectId));
      self.db.zrevrange(cvKey(userId,bucketName),0,0);
      self.db.exec().then(function(response){
        if(response[0]||options.version<response[1]){
          //Change has already been made or is already outdated, fulfill with false for the success param
          if(options.response){
            fulfill([false,response[1],JSON.parse(response[2])]);
          }else{
            fulfill([false,response[1]]);
          }
          if(!response[0]){
            //record outdated change anyway
            changeLog=(options||{});
            changeLog.c=true;//conflict
            changeLog.v=data;
            changeLog.sv=options.version || response[1];
            changeLog.id=objectId;
            self.db.zadd(ccidVersionsKey(userId,bucketName),response[1],ccid);
            self.db.set(ccidKey(ccid),JSON.stringify(changeLog));
          }
        }
        else{
          response[0]=response[0]||1;
          if(options.replace){
            obj={};
          }
          else{
            obj=JSON.parse(response[2]);
            if(!obj){
              obj={};
            }
          }
          if(!options.version){
            //If version is not set then the latest version is updated
            options.version=response[1];
          }
          var changeLog=(options||{});
          changeLog.c=false; //no conflicts
          changeLog.id=objectId;
          changeLog.sv=parseInt(response[1]);
          changeLog.cv=md5(response[3]+ccid);
          //if version is set, check that it is the same or greater than the one currently stored
          if(options.diffObj){
            //apply jsondiff merge
            console.log(obj,data);
            obj=jd.apply_object_diff(obj,data);
            changeLog.v=data;
          }
          else{
            //do a regular recursive merge
            merge(obj,data);
            //add changeobject to changelog
            changeLog.v =jd.object_diff(obj,data);
          }
          merge(changeLog,{
            "id": objectId
            , "o": "M"
            , "ev": (response[1]*1)+1
            , "ccids": [ccid]
          });
          self.db.multi();
          self.db.rpush(ccidsKey(userId,bucketName),ccid);
          self.db.zadd(ccidVersionsKey(userId,bucketName),response[1],ccid);
          self.db.set(ccidKey(ccid),JSON.stringify(changeLog));
          self.db.set(itemKey(userId,bucketName,objectId),JSON.stringify(obj));
          self.db.set(itemKey(userId,bucketName,objectId,response[1]*1+1),JSON.stringify(obj));
          self.db.hincrby(versionsKey(userId,bucketName),objectId,1);
          self.db.publish(channelKey(userId,bucketName),JSON.stringify([changeLog]));
          self.db.exec().then(function(response2){
            if(response2!=null){
              self.db.zadd(cvKey(userId,bucketName),response2[0],changeLog.cv);
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
  self=this;
  return new Promise(function(fulfill,reject){
    //assumes that the object already exists, since the Exists call should've been run as middleware
    if(ccid){//if ccid is set, it's a simperium API call
      self.db.multi();
      //check if change has been submitted before. ccid=client change id
      self.db.zscore(ccidVersionsKey(userId,bucketName),ccid);
      //check for version numbers to determine whether I should overwrite
      self.db.hget(versionsKey(userId,bucketName),objectId);
      self.db.zrevrange(cvKey(userId,bucketName),0,0);
      self.db.exec().then(function(response){
        if(response[0]){//change already made
          fulfill([response[1],412]);
        } else if(version&&version!=response[1]){//have to check versions, DELETE only goes through if the version number matches the current one
            fulfill([response[1],412]);
        }
        else{
          changeLog={o:"-"
            ,v:response[1]
            ,ev:response[1]+1
            ,id:objectId
            ,ccids:[ccid]};
          changeLog.cv=md5(response[2]+ccid);
          changeLog.clientid=self.clientid;
          self.db.multi();
          self.db.rpush(ccidsKey(userId,bucketName),ccid);
          self.db.zadd(ccidVersionsKey(userId,bucketName),response[1],ccid);
          self.db.set(ccidKey(ccid),JSON.stringify(changeLog));
          self.db.set(itemKey(userId,bucketName,objectId),"");
          self.db.set(itemKey(userId,bucketName,objectId,response[1]*1+1),"");
          self.db.hincrby(versionsKey(userId,bucketName),objectId,1);
          self.db.publish(channelKey(userId,bucketName),JSON.stringify([changeLog]));

          self.db.exec().then(function(response2){
            console.log(response2);
            fulfill([response2[3],200])
          });
        }
      });
    }
    else{
      //ccid not set, delete without logging
      self.db.multi();
      self.db.del(itemKey(userId,bucketName,objectId));
      self.db.hincrby(versionsKey(userId,bucketName),objectId,1);
      self.db.exec().then(function(response2){
        fulfill([response2[3],200])
      });
    }
  });
}
Cache.prototype.cacheIndex=function(userId,bucketName,bucketIndex,overwrite){
  var self=this;
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
        self.db.multi();
        res.forEach(function(data){
          versionHash[data.id]=data.v;
          if(Object.keys(data.d).length){
            self.db.set(itemKey(userId,bucketName,data.id),JSON.stringify(data.d));
            self.db.set(itemKey(userId,bucketName,data.id,data.v),JSON.stringify(data.d)); 
          } else{
            console.log(data)
            console.log("Skipping over "+itemKey(userId,bucketName,data.id)+" because it's an empty object");
          }
        });
        promiseArray=[];
        self.db.hmset(versionsKey(userId,bucketName),versionHash);
        self.db.del(ccidVersionsKey(userId,bucketName));
        if(!bucketIndex.mark){//only set currentKey if the cache is complete
          self.db.zadd(cvKey(userId,bucketName),0,current);
        }
        self.db.exec().then(function(){
          console.log("Successfully cached "+res.length+" items in "+bucketName);
          self.db.sadd(bucketsKey(userId),bucketName);
          fulfill(res.length);
        },function(error){
          console.log("Problem with caching"+error);
          reject("Problem with caching");
        });
      } else{
        console.log(bucketName+" is empty, nothing cached.");
        self.db.sadd(bucketsKey(userId),bucketName);
        fulfill(0);
      }
    },function(error){
      console.log("Problem with purging",error);
      reject("Problem with purging");
    });
  });
}
Cache.prototype.getIndex=function(userId,bucketName,options){
  self=this;
  return new Promise(function(fulfill,reject){
    var mark=options.mark || 0;
    var limit=options.limit || 100;
    self.db.send("hscan",[versionsKey(userId,bucketName),mark]).then(function(keys){
      if(keys[0]&&keys[0]!=0){
        mark=keys[0];
      }
      else{
        mark=undefined;
      }
      keys[1]=parseArray(keys[1]);
      return new Promise(function(resolve,reject){
        var index=[];
        if(options.data=="true"||options.data==true||options.data==1){
          if(Object.keys(keys[1]).length){
            var keyArray=Object.keys(keys[1]);
            self.db.mget(keyArray.map(mapItemKey(userId,bucketName))).then(function(objArray){
            for(i=0;i<keyArray.length;i++){
              if(objArray[i]&&objArray[i]!="null"){
                index.push({
                  id: keyArray[i]
                  , d: JSON.parse(objArray[i])
                  , v: keys[1][keyArray[i]]
                });
              }
            }
            resolve([index,mark]);
            },function(error){
              console.log("Error retrieving objects")
              reject(error);
            });
          } else{
          resolve([index,mark]);
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
              resolve([index,mark]);
            }
          }
          else{
            resolve([index,mark]);
          }
        }
      });
    },function(error){
        console.log("hscan error",error);
        return Promise.reject(error);
    })
    .then(function(res){
      self.db.zrevrange(cvKey(userId,bucketName),0,0).then(function(curr){
        fulfill([res[0],curr[0],res[1]]);
      });
    },function(error){
      reject(error);
    });
  });
}
Cache.prototype.addBucket=function(userId,bucketName){
  return new Bucket(userId,bucketName);
}
Cache.prototype.getChanges=function(userId,bucketName,current,returnEmpty){
  return new Promise(function(fulfill,reject){
    var bucket=new Bucket(userId,bucketName);
    bucket.getChanges(current,true)
    .then(function(response){
      console.log(4,response);
      if(response.length || returnEmpty){
        fulfill(response);
        bucket.exit();
      }else{
        channels[channel].on("message",function(message){
          fulfill(message);
          bucket.exit();
        });
        bucket.subscribe();
      }
    });
  });  
}

function Bucket(uid,bucket){
  EventEmitter.call(this);
  self=this;
  this.userId=uid;
  this.bucketName=bucket;
  this.cache=new Cache();
  this.cache.db.send("CLIENT",['SETNAME',bucket]);
  this.subscriber=redis.createClient();
  this.subscriber._parent=this;
  this.subscriber.on("message",function(channel,message){
    this._parent.emit("message",message);
  });
}
util.inherits(Bucket,EventEmitter);
Bucket.prototype.objectGet=function(objectId,objectVersion){
  return this.cache.objectGet(this.userId,this.bucketName,objectId,objectVersion);
}
Bucket.prototype.objectSet=function(objectId,data,options,ccid){
  return this.cache.objectSet(this.userId,this.bucketName,objectId,data,options,ccid);
}
Bucket.prototype.objectDelete=function(objectId,objectVersion,ccid){
  return this.cache.objectDelete(this.userId,this.bucketName,objectId,objectVersion,ccid);
}
Bucket.prototype.cacheIndex=function(bucketIndex,overwrite){
  return this.cache.cacheIndex(this.userId,this.bucketName,bucketIndex,overwrite);
}
Bucket.prototype.getIndex=function(options){
  return this.cache.getIndex(this.userId,this.bucketName,options);
}
Bucket.prototype.subscribe=function(){
  if(!this.subscribing){
    this.subscribing=true;
    this.subscriber.subscribe(channelKey(this.userId,this.bucketName)).then(function(res){
    console.log("Subscribed to",res);
  });
  }
  return channelKey(this.userId,this.bucketName);
}
Bucket.prototype.getChanges=function(current,returnString){//returnString=true should be faster, but inconsistent with the implementation of the other functions.
  var rd=this.cache.db;
  var self=this;
  var index;
  return new Promise(function(fulfill,reject){
    console.log(cvKey(self.userId,self.bucketName),current);
    rd.zscore(cvKey(self.userId,self.bucketName),current)
    .then(function(response){
      if(response==null){
        reject("Invalid cv");
        return Promise.reject("Invalid cv");
      } else{
        index=response;
        return rd.lindex(ccidsKey(self.userId,self.bucketName),response);
      }
    })
    .then(function(response){
      if(response==null){
        //is current
        return Promise.resolve([]);
      } else{
        //Change objects pending
        return rd.lrange(ccidsKey(self.userId,self.bucketName),index,index+99);
      }
    })
    .then(function(response){
      if(response.length){
        return rd.mget(response.map(ccidKey));
      } else{
        return Promise.resolve([]);
      }
    })
    .then(function(response){
      if(returnString){
        fulfill('['+response.join(',')+']');
      } else{
        fulfill(response.map(function(element){
          return JSON.stringify(element);
        }));
      }
    });
  });
}
Bucket.prototype.exit=function(){
  this.cache.exit();
  this.subscriber.quit();
}

/*

function Connection(){//Each connection should have its own individual subscription
  EventEmitter.call(this);
  self=this;
  if (process.env.REDISTOGO_URL) {
    var rtg   = require("url").parse(process.env.REDISTOGO_URL);
    this.rd = redis.createClient(rtg.port, rtg.hostname);
    this.db.auth(rtg.auth.split(":")[1]);
  } else {
    this.rd=redis.createClient();
  }
  this.rd.on("message",function(channel,message){
    console.log("cache",channel,message);
    this.emit(channel,channel,message);
  });
  this.subscriptionList=[];
}
util.inherits(Connection,EventEmitter);
Connection.prototype.subscribe=function(userId,bucketName){
  return channelKey(userId,bucketName);
}
Connection.prototype.makeSubscribe=function(){
  if(this.subscriptionList.length){
    this.rd.subscribe(this.subscriptionList).then(function(response){
      console.log("Subscribed to ",this.subscriptionList);
    });
    this.subscriptionList=[];
  } else{
    console.log("Already subscribed or empty list");
  }

}
Connection.prototype.exit=function(){
  this.rd.quit();
}
*/
function bucketsKey(userId){
  /* 
    set with all the bucket names of the corresponding user
    */
  return userId+"~buckets";
}
function itemKey(userId,bucketName,itemId,objectVersion){
  /* Objects are stored as simple strings in the format
    userid-bucketName-itemId which is always current, and 
    userid-bucketName-itemId~version which gives the specified version    
    */
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
/*
  {
    objectId:version
    2c35b27058491675bc906c0d2f76c66e:2
  }
*/
    return userId+"-"+bucketName+"~keys";
}
function ccidVersionsKey(userId,bucketName){
  /* Sorted set of all changes pushed, regardless of whether they took effect.
    This Is flushed periodically when doing conflict resolution
    set of ccids, sorted by the specified cv
    
    */
    return userId+"-"+bucketName+"~changes";
}
function ccidKey(ccid){
  /* change objects are stored as serialized strings, in the following keys.
    Don't flush this, since the API needs this to update outdated clients. */
  return "ccid~"+ccid;
}
function cvKey(userId,bucketName){
  /* sorted list of CVs.
    The score for CV corresponds to the length of ccidsKey after the change was pushed.
    So if it's current, lrange(ccidsKey,score,score) would be null
    so you can just iterate through subsequent changes by usign lrange(ccidsKey,score,score+10)
    */
    return userId+"-"+bucketName+"~cvs";
}
function ccidsKey(userId,bucketName){
  //List of ccids, in the order they were inserted
  return userId+'-'+bucketName+"~ccids";
}
function channelKey(userId,bucketName){
  /* Pub/Sub channel for a particular userId-bucketName */
  return userId+"-"+bucketName;
}
function parseArray(array){
  /*
    turns a redis response [key1,obj1,key2,obj2] into 
    {key1:obj1
      , key2:obj2
      }
    */
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
