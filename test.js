var a = function() {
  console.log(this)
}

var b = function() {
  console.log(this)
}

var c = {
  a,
  b
}

c.a()
c.b()
