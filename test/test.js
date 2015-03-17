//process.env.NODE_ENV = 'test';
var mocha = require('mocha');
var chai = require('chai');
var should=chai.should();
var expect=chai.expect;
var server;
var http=require("http");
var rp=require("request-promise");
var configs=require("../config.js");
var simperium=require("../simperium.js");
var appName=configs.appName;
var apiKey=configs.apiKey;
var testBucket=configs.testBucket || "guest";
var accessToken="";
var testUsername=configs.username;
var testPassword=configs.password;
var testObject=configs.testObject;

var localHost="http://localhost:5000";

before(function(done){    
  rp.get(localHost+"/admin")
    .then(function(success){
      console.log("Existing server detected");
      done();
    },function(error){
      console.log("Can't find server, starting now.");
      server=require("../alternate-endpoint");
      server.start(done);
    });
});

var request=rp;
var remote="";
var local="";
var bucketList={};
var bucketIndex={};
describe("Ditto Checks",function(){
  describe("Auth tests",function(){
    it("Remote Call",function(done){
      request
      .post({
        uri: localHost+"/1/"+appName+"/authorize/"
        , headers:{"X-Simperium-API-Key":apiKey}
        , json:{username:testUsername,password:testPassword}
      })
      .then(function(res){
        remote=res;
        done();
      },function(error){
        done();
      });
    });
    it("Internal call",function(done){
      request
      .get({
        uri: localHost+"/admin/test"
        , json: true
      })
      .then(function(user){
        expect(user).to.be.a("object");
        done();
      });
    });
    it('Local Call',function(done){
      request
      .post({
        uri: localHost+"/1/"+appName+"/authorize/"
        , headers:{"X-Simperium-API-Key":apiKey}
        , json:{username:testUsername,password:testPassword}
      })
      .then(function(res){
        local=res;
        done();
      });
    });
    it('Equality',function(done){
      result=compare(remote,local);
      expect(result).to.be.at.most(1);
      expect(local).to.be.a("object");
      expect(remote).to.be.a("object");
      accessToken=local.access_token;
      done();
    });
  });
  describe("List Buckets",function(){
    it("Remote Call",function(done){
      request
      .get({
        uri: "https://api.simperium.com/1/"+appName+"/buckets"
        , headers:{"X-Simperium-Token":accessToken}
        , method: "GET"
      })
      .then(function(res){
        remote=JSON.parse(res);
        expect(remote).to.be.a("object");
        done();
      },function(error){
        done();
      });
    });
    it('Local Call',function(done){
      request
      .get({
        uri: localHost+"/1/"+appName+"/buckets"
        , headers:{"X-Simperium-Token":accessToken}
        , method: "GET"
      })
      .then(function(res){
        local=JSON.parse(res);
        expect(local).to.be.a("object");
        bucketList=local;
        done();
      });
    });
    it('Equality',function(done){
      result=compare(remote,local);
      result.should.equal(0);
      done();
    });
  });
  describe("Bucket Index",function(){
    it("Remote Call",function(done){
      request
      .get({
        uri: "https://api.simperium.com/1/"+appName+"/"+testBucket+"/index"
        , headers:{"X-Simperium-Token":accessToken}
        , method: "GET"
        , qs:{
          data:true
        }
      })
      .then(function(res){
        remote=JSON.parse(res);
        expect(remote).to.be.a("object");
        done();
      },function(error){
        throw error;
        done();
      });
    });
    it('Local Call',function(done){
      request
      .get({
        uri: localHost+"/1/"+appName+"/"+testBucket+"/index"
        , headers:{"X-Simperium-Token":accessToken}
        , method: "GET"
        , qs:{
          data:true
        }
      })
      .then(function(res){
        local=JSON.parse(res);
        expect(local).to.be.a("object");
        bucketIndex=local;
        done();
      },function(error){
        throw error;
        done();
      });
    });
    it('Equality',function(done){
      result=compare(remote,local);
      result.should.equal(0);
      local.should.not.equal({});
      remote.should.not.equal({});
      done();
    });
  });
  describe("Item Retrieval",function(){
    it("Remote Call",function(done){
      request
      .get({
        uri: "https://api.simperium.com/1/"+appName+"/"+testBucket+"/i/"+testObject
        , headers:{"X-Simperium-Token":accessToken}
        , method: "GET"
      })
      .then(function(res){
        remote=JSON.parse(res);
        expect(remote).to.be.a("object");
        done();
      },function(error){
        throw error;
        done();
      });
    });
    it('Local Call',function(done){
      request
      .get({
        uri: localHost+"/1/"+appName+"/"+testBucket+"/i/"+testObject
        , headers:{"X-Simperium-Token":accessToken}
        , method: "GET"
      })
      .then(function(res){
        local=JSON.parse(res);
        expect(local).to.be.a("object");
        bucketIndex=local;
        done();
      },function(error){
        throw error;
        done();
      });
    });
    it('Equality',function(done){
      result=compare(local,remote);
      result.should.equal(0);
      local.should.not.equal({});
      remote.should.not.equal({});
      done();
    });
  });
});

describe("simperium.js Checks",function(){
  it("Retrieve entire bucket index",function(done){
    bucket=new simperium.bucket();
    bucket.init({
      accessToken:accessToken
      , appName: appName
    },testBucket);
    bucket.getAll({data:true}).then(function(res){
      expect(res.index.length).to.be.above(99);
      done();
    },function(err){
      expect(false).to.be.ok();
      done();
      console.log(err); 
    });
  });
  
});

describe("Caching Checks",function(){
  it('List Buckets',function(done){
    request
    .get({
      uri: localHost+"/1/"+appName+"/buckets"
      , headers:{"X-Simperium-Token":accessToken}
      , method: "GET"
    })
    .then(function(res){
      local=JSON.parse(res);
      local.should.be.a("object");
      done();
    });
  });
  it("Compare cached listing",function(done){
    result=compare(local,bucketList);
    expect(result).to.be.equal(0);
    done();
  });
  it('Bucket Index',function(done){
    request
    .get({
      uri: localHost+"/1/"+appName+"/"+testBucket+"/index"
      , headers:{"X-Simperium-Token":accessToken}
      , method: "GET"
      , qs:{
        data:true
      }
    })
    .then(function(res){
      local=JSON.parse(res);
      local.should.be.a("object");
      done();
    },function(error){
      throw error;
      done();
    });
  });
  it("Compare cached listing",function(done){
    result=compare(local,bucketIndex);
    expect(result).to.be.equal(0);
    done();
  });
});



function compare(sub,set){
  diff=0;
  if(typeOf(sub)=="array"&&typeOf(set)=="array"){
    for(i=0;i<sub.length;i++){
      diff+=compare(sub[i],set[i]);
    }
  } else if(typeOf(sub)=="object"&&typeOf(set)=="object"){
    for(var key in sub){
      if(sub[key]!=set[key]){
        if(typeof sub[key] == "object" && typeof set[key] == "object"){
          diff+=compare(sub[key],set[key]);
        }else{
          diff++;
          console.log("different1",sub[key],"&&&&&&&&",set[key]);
        }
      }
    }
  } else if(sub!=set){
    console.log("different2",sub,"&&&&&&&&",set);
    diff++;
  }
  return diff;
}
function typeOf(input) {
	return ({}).toString.call(input).slice(8, -1).toLowerCase();
}


function getResponse(res,format){
  format= format || "json";
  return new Promise(function(fulfill,reject){
    response="";
    res.on("data",function(data){
      response+=data;
    });
    res.on("end",function(){
      if(format=="json"){
        fulfill(response);
      } else{
        fulfill(response);
      }
    });
    res.on("error",function(error){
      console.log(error);
      reject(error);
    });
  });
}