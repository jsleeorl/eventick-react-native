'use strict';

var React = require('react-native');
var {
  StyleSheet,
  Text,
  View,
  ListView,
  TouchableHighlight,
  Alert
} = React;

var SearchBar = require('SearchBar');

var EVENTICK_PARTICIPANTS_URL = 'https://www.eventick.com.br/api/v1/events/:event_id/attendees.json';
var EVENTICK_CHECKIN_URL = 'https://www.eventick.com.br/api/v1/events/:event_id/attendees/check_all.json';

var resultsCache = {
  participants: []
};

var ParticipantsScreen = React.createClass({
  // TODO: Show loading spinner when syncing checkins
  // TODO: When pressing sync, pull latest changes from server
  
  getInitialState: function() {
    return {
      loaded: false,
      fetchedParticipants: [],
      dataSource: new ListView.DataSource({
        rowHasChanged: (row1, row2) => row1 !== row2,
      }),
    };
  },
  
  componentDidMount: function() {
    this.getParticipants();
  },
  
  getParticipants: function() {
    var eventickParticipantsURL = EVENTICK_PARTICIPANTS_URL.replace(':event_id', this.props.event.id);
    
    fetch(eventickParticipantsURL, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': this.props.eventickToken
      },
    })
    .then(res => res.json())
    .catch(err => {
      console.log(err);
    })
    .then(json => {
      resultsCache.participants = json.attendees;
      this.setState({
        loaded: true,
        dataSource: this.state.dataSource.cloneWithRows(json.attendees),
        fetchedParticipants: json.attendees,
      });
    });
  },
  
  onParticipantPressed: function(participant) {
    // React-native won't redraw the rows if we just update the participants
    // Array. We need to create a copy, change the property we want and then
    // use setState. https://github.com/facebook/react-native/issues/4104
    let newParticipantsArray = resultsCache.participants.slice();
    var indexToUpdate = 0;
    for(var i = 0; i < newParticipantsArray.length; i++) {
      if(newParticipantsArray[i].id === participant.id) {
        indexToUpdate = i;
      }
    }
    if (newParticipantsArray[indexToUpdate].checked_at === null) {
      newParticipantsArray[indexToUpdate] = {
        ...resultsCache.participants[indexToUpdate],
        checked_at: new Date().toISOString(),
      };
    } else {
      newParticipantsArray[indexToUpdate] = {
        ...resultsCache.participants[indexToUpdate],
        checked_at: null,
      };
    }
    resultsCache.participants = newParticipantsArray;    
    this.setState({
      dataSource: this.state.dataSource.cloneWithRows(resultsCache.participants),
    });
  },
  
  onSyncPressed: function() {
    var eventickCheckInURL = EVENTICK_CHECKIN_URL.replace(':event_id', this.props.event.id);
    
    var body = { attendees: [] };
    for(var i = 0; i < resultsCache.participants.length; i++) {
      if(resultsCache.participants[i].checked_at !== this.state.fetchedParticipants[i].checked_at) {
        var participant = {};
        participant.id = resultsCache.participants[i].id;
        participant.checked_at = resultsCache.participants[i].checked_at;
        body.attendees.push(participant);
      }
    }
    
    if (body.attendees.length > 0) {
      fetch(eventickCheckInURL, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': this.props.eventickToken,
          },
          body: JSON.stringify(body),
        })
        .then(res => {
          if(res.ok) {
            this.displayAlert('Success', 'Checkin succesful');
            this.state.fetchedParticipants = resultsCache.participants;
          } else {
            return Promise.reject(new Error(res.statusText));
          }
        })
        .catch(err => {
          this.displayAlert('Error', 'Network response error while checking in');
        });
    }
  },
  
  shuffleArray: function(array) {
    var shuffledArray = array.slice();
    
    for (var i = shuffledArray.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var temp = shuffledArray[i];
      shuffledArray[i] = shuffledArray[j];
      shuffledArray[j] = temp;
    }
    return shuffledArray;
  },
  
  onRandomPressed: function() {
    // Randomize list
    var shuffledParticipants = this.shuffleArray(resultsCache.participants);
    
    // Get checked in participants first
    var randomParticipants = shuffledParticipants.filter(function(participant) {
      if(participant.checked_at !== null) return participant;
    });
    
    // Make sure there's at least 10 participants in array
    if(randomParticipants.length < 10) {
      randomParticipants = randomParticipants.concat(shuffledParticipants.slice(0, 10 - randomParticipants.length));
    } else {
      randomParticipants = randomParticipants.slice(0,10);
    }
    
    var randomParticipantsMessage = randomParticipants.map(function(participant) {
      return participant.name;
    }).join('\n');
    
    this.displayAlert('Lucky!', randomParticipantsMessage);
  },
  
  displayAlert: function(title, message) {
    Alert.alert(
      title,
      message,
      [
        {text: 'OK', onPress: () => console.log('OK Pressed')},
      ]
    )
  },
  
  onSearchChange: function(event: Object) {
    var filter = event.nativeEvent.text.toLowerCase();
    
    this.setState({
      dataSource: this.state.dataSource.cloneWithRows(
        resultsCache.participants.filter(function(participant) {
          return participant.name.toLowerCase().match(filter);
      })),
    });
  },
  
  renderParticipant: function(participant) {
    return (
      <TouchableHighlight onPress={() => this.onParticipantPressed(participant)}>
        <View>  
          <View style={[styles.participantRow, participant.checked_at && styles.participantCheckedIn]}>
            <Text style={styles.participant}>{participant.name}</Text>
            <Text style={styles.participantTicket}>{participant.ticket_type}</Text>
          </View>
          <View style={styles.separator} />
        </View>
      </TouchableHighlight>
    );
  },
  
  render: function() {
    var content;
    
    if(!this.state.loaded) {
      // TODO: Add loading spinner
      return (
        <View style={styles.loading}>
          <Text>Loading...</Text>
        </View>
      );
    } else {      
      if(resultsCache.participants.length === 0) {
        content = <View style={styles.loading}>
            <Text>No participants for this event</Text>
          </View>;
      }
      else if(this.state.dataSource.getRowCount() === 0) {
        content = <View style={styles.loading}>
            <Text>No participants for this search</Text>
          </View>;
      } else {
        content = 
          <ListView
            ref="listview"
            dataSource={this.state.dataSource}
            renderRow={this.renderParticipant}
            styles={styles.participantsList}
          />;
      }
    }
    
    return (
      <View style={styles.container}>
        <SearchBar
          onSearchChange={this.onSearchChange}
          isLoading={this.state.loaded}
          onFocus={() =>
            this.refs.listview && this.refs.listview.getScrollResponder().scrollTo(0)}
        />
        <View style={styles.separator} />
        {content}
        <View style={styles.flowRight}>
          <TouchableHighlight style={styles.button}
            onPress={this.onRandomPressed}>
            <Text style={styles.buttonText}>Random</Text>
          </TouchableHighlight>
          <TouchableHighlight style={styles.button}
            onPress={this.onSyncPressed}>
            <Text style={styles.buttonText}>Sync</Text>
          </TouchableHighlight>
        </View>
      </View>
    )
  }
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FEFEFE',
    marginTop: 64,
  },
  flowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch'
  },
  button: {
    flex: 1,
    height:60,
    backgroundColor: '#2196F3',
    alignSelf: 'stretch',
    justifyContent: 'center',
    borderColor: '#FEFEFE',
    borderWidth: 2,
  },
  buttonText: {
    fontFamily: 'Helvetica Neue',
    fontSize: 18,
    color: 'white',
    alignSelf: 'center'
  },
  separator: {
    height: 1,
    backgroundColor: '#CCCCCC',
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FEFEFE',
    padding: 20,
  },
  participantsList: {
    marginTop: 64,
  },
  participant: {
    fontFamily: 'Helvetica Neue',
    textAlign: 'left',
  },
  participantTicket: {
    fontFamily: 'Helvetica Neue',
    textAlign: 'left',
    color: '#BBBBBB',
  },
  participantRow: {
    backgroundColor: '#FEFEFE',
    padding: 20,
  },
  participantCheckedIn: {
    backgroundColor: '#7CB265'
  }
});

module.exports = ParticipantsScreen;