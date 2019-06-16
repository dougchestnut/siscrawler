const scraper = require('sisscraper');
const admin = require("firebase-admin");
const commandLineArgs = require('command-line-args')

const optionDefinitions = [
  { name: 'latest', alias: 'l', type: Boolean }
]
const options = commandLineArgs(optionDefinitions)

// Firebase setup stuff
var serviceAccount = require("../../uva-api-firebase-adminsdk-ovbj8-ff0464c1dd.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://uva-api.firebaseio.com"
});
var db = admin.database();

var isArrayEqualShallow = function(a,b){
  if (!a && b && b.length == 0) return true;
  if (!b && a && a.length == 0) return true;
  if (!b || !a) return false;
  a.forEach(i=>{
    if (b.indexOf(i)>0) {
//      console.log("Array mismatch!!!")
      return false;
    }
  });
  return true;
}
var areEqualShallow = function(a, b) {
    for(var key in a) {
        if ( Array.isArray(a[key]) ) { // && !isArrayEqualShallow(a[key],b[key]) ) {
          if (!isArrayEqualShallow(a[key],b[key])) return false;
        } else if (key != 'components' && a[key] !== b[key]) {
//          console.log("field didn't match "+key)
          return false;
        }
    }
    return true;
}

var getCreateUpdate = function(path, data, merge){
  var ref = db.ref("courses/"+path);
  return ref.once("value").then( function(snapshot) {
    const value = snapshot.val();
    if (!value) {
      // set
      console.log(data.id+' attempt to write')
      return ref.set(data);
    } else if ( !areEqualShallow(data,value) ) {
      // update
      console.log(data.id+' found a value, update')
      console.log("**** current");
      console.log(value);
      console.log("**** new");
      console.log(data);
      console.log("**** write");
      if (!areEqualShallow(data[merge],value[merge])) {
        data[merge] = [...new Set( data[merge].concat(value[merge]) )]
      }
      console.log(data);
      console.log("****")
      return ref.update(data);
    } else {
      console.log(data.id+' no change, no write');
      return Promise.resolve();
    }
  });
}
// End Firebase setup stuff

function shuffle(array) {
  var currentIndex = array.length, temporaryValue, randomIndex;

  // While there remain elements to shuffle...
  while (0 !== currentIndex) {

    // Pick a remaining element...
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;

    // And swap it with the current element.
    temporaryValue = array[currentIndex];
    array[currentIndex] = array[randomIndex];
    array[randomIndex] = temporaryValue;
  }

  return array;
}

// rid of duplicates while pushing certin props into in array
function dedupe(arry, pushProps=[]){
  var temp = {};
  arry.forEach(i=>{
    if(!temp[i.id]) {
      temp[i.id]=i
      pushProps.forEach(p=>{
        if (!Array.isArray(temp[i.id][p])) temp[i.id][p]=[temp[i.id][p]];
      });
    } else {
      pushProps.forEach(p=>{
        temp[i.id][p].push(i[p]);
      });
    }
  });
  return Object.values(temp);
}

async function runScrape() {

  // get the careers into Firebase
  var careers;
  await scraper.getCareers().then( c=>{
    c.forEach(ca=>delete ca.link);
    careers = c;
    return Promise.all(
      careers.map((career)=>{
        return getCreateUpdate('careers/'+career.id, career);
      })
    );
  });

  // get the subject index into Firebase
  var subjectIndex;
  await scraper.getSubjectIndex().then( c=>{
    c.forEach(ca=>delete ca.link); // don't need link
    subjectIndex = dedupe(c,["career"]);
    return Promise.all(
      subjectIndex.map((subi)=>{
        return getCreateUpdate('subjectIndex/'+subi.id, subi);
      })
    );
  });

  // get the subjects into Firebase
  var subjects;
  await scraper.getSubjects().then( c=>{
    c.forEach(ca=>delete ca.link); // don't need link
    subjects = dedupe(c,["career"]);
    return Promise.all(
      c.map((sub)=>{
        return getCreateUpdate('subject/'+sub.id, sub);
      })
    );
  });

  // get the courses into Firebase
  var courses = [];
  for (var i=0; i<subjects.length; i++){
    var subject = subjects[i];
    for (var j=0; j<subject.career.length; j++) {
      var career = subject.career[j];
      // Let's get these one subject at a time
      await scraper.getCourses(career, subject.subjectIndex, subject.id).then( c=>{
          c.forEach(ca=>delete ca.link); // don't need link
          c = dedupe(c);
          courses = courses.concat(c);
          return Promise.all(
            c.map((course)=>{
              return getCreateUpdate('course/'+course.id, course, "subject");
            })
          );
        })

    }
  }

  courses = shuffle(courses);

  // get the course into Firebase
  for (var i=0; i<courses.length; i++) {
      var course = courses[i];
      await scraper.getCourse(course.id, course.career, course.subjectIndex, course.subject).then( c=>{
        c.forEach(ca=>delete ca.link); // don't need link
        c = dedupe(c);
        course = c[0];
        return Promise.all(
          c.map((course)=>{
            return getCreateUpdate('course/'+course.id, course, "subject");
          })
        );
      })
  }

  // build out terms
  var terms = {};
  courses.forEach(c=>{ if (c.terms) { c.terms.forEach(t=>{if (!terms[t.id]) terms[t.id]=t;}); } });
  for (var termId in terms) {
    if (terms.hasOwnProperty(termId)) {
      getCreateUpdate('terms/'+termId, terms[termId]);
    }
  }

/*
scraper.getTerms(null,"GRAD","A").then( c=>{
//scraper.getTerms("038618").then( c=>{
//scraper.getTerms("006846").then( c=>{
//scraper.getTerms("038530").then( c=>{
  console.log('Terms:')
  console.log(c)
} );
*/

  var sections = [];
  // get the sections into Firebase
  for (var i=0; i<courses.length; i++) {
      var course = courses[i];
      await scraper.getSections(null,course.id, course.career, course.subjectIndex, course.subject).then( c=>{
        c.forEach(ca=>delete ca.link); // don't need link
        c = dedupe(c);
        sections = sections.concat(c);
        return Promise.all(
          c.map((section)=>{
            return getCreateUpdate('section/'+section.id, section, "subject");
          })
        );
      })
  }

  // get the section into Firebase
  for (var i=0; i<sections.length; i++) {
      var section = sections[i];
      await scraper.getSection(section.id, section.termid, section.courseId, section.career, section.subjectIndex, section.subject).then( c=>{
        c.forEach(ca=>delete ca.link); // don't need link
        c = dedupe(c);
        section = c[0];
        if (section.termId && section.dates && terms[section.termId] && !terms[section.termId].dates) {
          terms[section.termId].dates = section.dates;
          getCreateUpdate('terms/'+section.termId, terms[section.termId]);
        }
        return Promise.all(
          c.map((section)=>{
            return getCreateUpdate('section/'+section.id, section, "subject");
          })
        );
      })
  }

}

if (options.latest) {
  console.log('just the latest')
  process.exit();
} else {
  runScrape().then(
    ()=>{ process.exit(); }
  );
}
