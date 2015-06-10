module.exports={
    appName: "critical-hit-1d20"
  
  //Requires an admin API key to access bucket listings for the user
  , apiKey : "05ecca7bca59ca1f6b2f7b831390a1ef"

  , port : 5000
  
  , redisOptions:{
    //Follows the init object in the then-redis README
      host: 'localhost'
    , port: 6379
    , password: ""
  }
  
  , options:{
  }
  
  //Test items
  , testParams:{
    //It is recommended to use a test user for this (or at least a test bucket), since the test will write additional objects to the bucket.
      username:  "username@example.com"
    , password:  "password"
    //For test purposes the provided user has to have more than 99 entries in this bucket (defaults to guest)
    , bucket:    "bucket1"
    //this should be the id of an individual object within the bucket
    , object:    "object1"
  }

}