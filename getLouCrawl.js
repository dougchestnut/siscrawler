const scraper = require('sisscraper');
const admin = require("firebase-admin");

// Firebase setup stuff
var serviceAccount = require("../../uva-api-firebase-adminsdk-ovbj8-ff0464c1dd.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://uva-api.firebaseio.com"
});
var db = admin.database();

async function runScrape() {

  // get all of the courses from firebase
  var ref = db.ref("courses/course");
  await ref.once("value")
    .then(
      function(snapshot) {
        var ret = [];
        snapshot.forEach( function(data) {
          const c = data.val();
          if (c.terms) {
            c.terms.forEach(function(t) {
              console.log("courseId: "+c.id+" termId: "+t.id);
              ret.push( [c.id, t.id] );
    //          await scraper.importHistoryFromLou(c.id, t.id).then(c=>{
    //                console.log(c);
    //          })
            });
          }
        })
        return ret;
      }
    ).then(
      a=>{console.log(a);}
    );
/*
    return Promise.all(
      ret.map(function(a){
        return scraper.importHistoryFromLou(a[0],a[1])
          .then(c=>{
            console.log(c);
          });
      })
    );
*/
}

runScrape().then(
  ()=>{ process.exit(); }
);
