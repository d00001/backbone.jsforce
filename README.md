#backbone.jsforce

backbone.jsforce is Salesforce Connection Library using jsforce toolkit.
Based on Backbone.Force Library.

##How to Use.

    var connection = new jsforce.Connection({ accessToken: '{!$API.Session_Id}' });
    Backbone.jsforce.initialize(connection);

    var Opportunity = Backbone.jsforce.Model.extend({
        type:'Opportunity',
        fields:['name','Id']
    });

##ISSUE



##LICENSE

  Backbone.jsforce is MIT LICENSE.


##Contact
  please feel free to conntact m.okamoto@gmail.com
