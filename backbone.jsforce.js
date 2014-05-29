/**
 * backbone.jsforce - sync salesforce database with backbone.model using jsforce
 */
(function(root, factory) {

  if (typeof define === "function" && define.amd) {
    define(['underscore', 'Backbone', 'jsforce'], factory);
  } else if (typeof exports !== 'undefined') {
    // Node.js or CommonsJS
    factory(require('underscore'), require('backbone'), require("jsforce"));
  } else {
    //Browser Global
    factory(root._, root.Backbone, root.jsforce);
  }
}(this, function(_, Backbone, jsforce) {

  var methodMap = {
    'create': 'POST',
    'update': 'PATCH',
    'delete': 'DELETE',
    'read': 'GET'
  };

  Backbone.jsforce = {
    initialize: function(connection) {
      this.connection = connection;
    },
    sync: function(method, model, options) {
      options || (options = {});
      var that = this,
        error = options.error;
        _.extend(options, {
        cache: false,
        dataType: 'json',
        processData: false,
        async: true,
        type: methodMap[method],
        contentType: 'application/json',
        beforeSend: function(xhr) {
          if (connection.proxyUrl !== null) {
            xhr.setRequestHeader('SalesforceProxy-Endpoint', options.url);
          }
          xhr.setRequestHeader("Authorization", "OAuth " + connection.accessToken);
          xhr.setRequestHeader('X-User-Agent', 'jsforce/' + connection.version);
        },
        error: function(xhr, textStatus, errorThrown) {
          if (connection.refreshToken && xhr.status === 401) {
            connection.oauth2.requestToken(connection.accessToken, function(err, response) {
              that.sync.call(that, method, model, options);
            });
          } else if (error) {
            error(xhr, textStatus, errorThrown);
          }
        }
      });

      if (method === 'update') {
        var changes = _.clone(model.changesToUpdate) || [],
          updates = _.pick(model.toJSON(), changes);
        delete updates.Id;
        var error = options.error;
        options.error = function() {
          model.changesToUpdate = _.union(model.changesToUpdate, changes);
          if (error) error.apply(this, Array.prototype.slice.call(arguments));
        };
        model.changesToUpdate.length = 0;
        options.data = JSON.stringify(updates);
      }
      Backbone.sync(method, model, options)
    },
    _getServiceURL: function() {
      return connection.instanceUrl + '/services/data/v' + connection.version;
    }
  };

  Backbone.jsforce.Model = Backbone.Model.extend({
    idAttribute: 'Id',
    type: null,
    fields: null,
    changesToUpdate: null,
    sync: Backbone.jsforce.sync,
    fetch: function(options) {
      options || (options = {});
      options.addToUpdates = false;
      var fields = this.fields ? '?fields=' + this.fields.join(',') : '';
      _.extend(options, {
        url: (Backbone.jsforce._getServiceURL() + '/sobjects/' + this.type + '/' + this.id + fields)
      });
      return Backbone.Model.prototype.fetch.call(this, options);
    },

    save: function(key, value, options) {
      if (_.isObject(key) || key == null) {
        options = value;
      }
      options || (options = {});
      _.extend(options, {
        url: (Backbone.jsforce._getServiceURL() + '/sobjects/' + this.type + '/' + (!this.isNew() ? this.id : ''))
      });
      return Backbone.Model.prototype.save.call(this, key, value, options);
    },

    set: function(key, value, options) {
      var attrs;
      if (_.isObject(key) || key == null) {
        attrs = key;
        options = value;
      } else {
        attrs = {};
        attrs[key] = value;
      }

      if (attrs && !this.isNew() && (!options || options.addToUpdates !== false)) {
        this.changesToUpdate || (this.changesToUpdate = []);
        this.changesToUpdate = _.union(this.changesToUpdate, Object.keys(attrs));
      }
      return Backbone.Model.prototype.set.call(this, key, value, options);
    },

    parse: function(resp, xhr) {
      var result = resp;
      if (resp != null) {
        result = _.clone(resp);
        if (result.hasOwnProperty('id')) {
          result.Id = result.id;
          delete result.id;
        }

        if (result.hasOwnProperty('attributes')) {
          if (this.type == null) {
            this.type = result.attributes.type;
          }
          delete result.attributes;
        }
        delete result.success;
        if (result.errors && result.errors.length > 0) {
          delete result.errors;
        }
      }
      return result;
    }
  });

  Backbone.jsforce.Collection = Backbone.Collection.extend({
    query: null,
    model: Backbone.jsforce.Model,
    sync: Backbone.jsforce.sync,
    fetch: function(options) {
      if (this.query == null) {
        throw new Error('Force.Collection.query property is required!');
      }
      var query = this.query;
      if (this.query.toLowerCase().indexOf('where') == 0) {
        var model = new this.model();
        if (model.fields == null) {
          throw new Error('With WHERE queries Model.fields property needs to be set!');
        }
        if (model.type == null) {
          throw new Error('With WHERE queries Model.type property needs to be set!');
        }
        query = 'SELECT ' + model.fields.join(',') + ' FROM ' + model.type + ' ' + this.query;
      }
      options = options ? _.clone(options) : {};
      options.url = Backbone.jsforce._getServiceURL() + '/query/?q=' + encodeURIComponent(query);
      if (options.parse === undefined) {
        options.parse = true;
      }
      var collection = this,
        success = options.success,
        records = [];
      options.success = function(resp, status, xhr) {
        records.push.apply(records, resp.records);
        if (resp.nextRecordsUrl !== undefined) {
          var _options = _.clone(options);
          _options.url = Force._getServiceURL() + resp.nextRecordsUrl;
          collection.sync.call(collection, 'read', collection, _options);
        } else {
          collection[options.add ? 'add' : 'reset'](collection.parse(records, xhr), options);
          if (success) {
            success(collection, resp);
          }
        }
      };
      options.error = function(collection, resp, options) {
        collection.trigger('error', collection, resp, options);
      };
      return this.sync.call(this, 'read', this, options);
    }
  });
}));
