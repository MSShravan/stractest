const express = require('express')

const app = express()

const ngrok = require('ngrok');

const bodyParser = require('body-parser');
app.use(bodyParser.json());

app.set("view engine", "ejs")

const {google} = require('googleapis')

const fs = require('fs');

const requestNew = require('request')

const OAuth2Data = require('./credentials.json')

const CLIENT_ID = OAuth2Data.web.client_id
const CLIENT_SECRET = OAuth2Data.web.client_secret
const REDIRECT_URI = OAuth2Data.web.redirect_uris[0]

const OAuth2Client = new google.auth.OAuth2(
    CLIENT_ID,
    CLIENT_SECRET,
    REDIRECT_URI
)

var authed = false

var name

const SCOPES = "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/drive.metadata.readonly https://www.googleapis.com/auth/drive.readonly"

app.listen(8080, () => {
    console.log("App started on port 8080")
})

app.get('/',(req,res)=>{
    if (!authed){
        var url = OAuth2Client.generateAuthUrl({
            access_type:'offline',
            scope:SCOPES
        })

        console.log(url)

        res.render("index", {url:url})
    } else{
        
        var oauth2 = google.oauth2({
            auth:OAuth2Client,
            version:'v2'
        })

        oauth2.userinfo.get(function(err, response){
            if(err) throw err

            console.log(response.data)

            name = response.data.given_name

            // res.render("home", {name:name})

            res.redirect('/list')
        })
    }
})

app.get('/home',(req,res)=>{
    const code = req.query.code

    if(code){
        OAuth2Client.getToken(code, function(err, tokens){
            if(err){
                console.log("Error logging in")
                console.log(err)
            } else{
                console.log("Success")
                console.log(tokens)
                OAuth2Client.setCredentials(tokens)

                authed = true

                res.redirect('/')
            }
        })
    }
})

app.get('/list', (req, res) => {
    const drive = google.drive({ version: 'v3', auth: OAuth2Client });
    drive.files.list({
        pageSize: 10,
    }, (err, response) => {
        if (err) {
            console.log(err);
            throw err
        }
        const files = response.data.files;
        if (files.length) {
            console.log('Files:');
            files.map((file) => {
                console.log(`${file.name} (${file.id})`);
            });
        } else {
            console.log('No files found.');
        }

        res.render("home", {name:name, files:files})
    });
});


app.get('/download', async (req, res)=>{
    const drive = google.drive({ version: 'v3', auth: OAuth2Client });

    var fileId = req.query.fileid
    const fileMetadata = await drive.files.get({ fileId, fields: 'name,mimeType' });
    const fileName = fileMetadata.data.name;
    const mimeType = fileMetadata.data.mimeType;
    const downloadUrl = `https://drive.google.com/uc?id=${fileId}&export=download`;

    console.log(fileName, mimeType)
    requestNew.get(downloadUrl)
    .on('response', function(response) {
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    })
    .pipe(res);

})


app.get('/users', async (req, res)=>{

    var fileId = req.query.fileid
    var users

    const drive = google.drive({ version: 'v3', auth: OAuth2Client });
    try {
      const permissions = await drive.permissions.list({
        fileId: fileId,
        fields: 'permissions(emailAddress,id,role,displayName)',
      });
  
      users = permissions.data.permissions;
      console.log(`Users with access to ${fileId}:`);
      users.forEach(user => {
        console.log(`- ${user.displayName} (${user.emailAddress}) - ${user.role}`);
      });
  
    } catch (err) {
      console.error(`Error retrieving permissions for ${fileId}: ${err}`);
    }

    res.render("users", {users:users})
  })


  app.post('/webhook', async (req, res) => {
    const drive = google.drive({ version: 'v3', auth: OAuth2Client });
    const {channelId, resourceId, resourceIdString, token} = req.body;
  
    // Verify the authenticity of the notification using the channel ID and token.
    // See https://developers.google.com/drive/api/guides/push#verifying-notification-authenticity
    // for more information.
  
    // Retrieve the updated list of users who have access to the file.
    const file = await drive.files.get({fileId: resourceIdString, fields: 'id, name, permissions'});
    const permissions = file.data.permissions;
    
    // Process the updated list of permissions as needed.
    console.log(`File ${file.data.name} (${file.data.id}) permissions updated:`, permissions);
  
    res.status(200).end();
  });

  async function watchFile(fileId) {
    const drive = google.drive({ version: 'v3', auth: OAuth2Client });

    const ngrokUrl = await ngrok.connect(8080);

    const channel = {
      id: 'my-channel-id',
      type: 'web_hook',
      address: ngrokUrl + '/webhook?resourceIdString='+fileId,
    };
  
    const {data: {resourceUri}} = await drive.files.watch({
      fileId,
      requestBody: {id: 'my-watch-id5', type: 'web_hook', address: channel.address},
      channel,
    });
    
    console.log(`Watching file ${fileId} for changes: ${resourceUri}`);
  }
