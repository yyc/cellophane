module.exports = function(base,extend){
  if(typeOf(extend)=="array"&&typeOf(base)=="array"){
    base=base.concat(extend);
  }
  for(var key in extend){
    if(typeOf(extend[key])=="array"&&typeOf(base[key])=="array"){
      base[key]=base[key].concat(extend[key]);
    }
    else if(typeOf(extend[key])=="object"&&typeOf(base[key])=="object"){
      merge_recursively(base[key],extend[key]);
    }
    else{
      base[key]=extend[key];
    }
  }
}

function typeOf(input) {
	return ({}).toString.call(input).slice(8, -1).toLowerCase();
}

