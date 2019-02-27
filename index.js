"use strict";
const { WebClient } = require("@slack/client");
const moment = require("moment-timezone");
const yaml = require("js-yaml");
const fs = require("fs");
const rp = require("request-promise");

const token = process.env.SLACK_TOKEN;
const web = new WebClient(token);

async function loadConfig() {
  return yaml.safeLoad(fs.readFileSync("./config.yml", "utf8"));
}

/**
 *
 * @param {Array} users
 */
async function getMembersByName(users) {
  const web = new WebClient(token);

  const usersList = await web.users.list();
  return usersList.members.filter(member => {
    return users.indexOf(member.name) != -1;
  });
}

/**
 *
 * @param {Array} members
 * @param {String} channelID
 */
async function inviteMembers(members, channelID) {
  members.forEach(async member => {
    await web.channels.invite({
      user: member.id,
      channel: channelID
    });
  });
}

/**
 *
 * @param {String} message
 * @param {String} responseUrl
 */
async function sendMessage(message, responseUrl) {
  const options = {
    method: "POST",
    uri: responseUrl,
    json: {
      text: message,
      response_type: "in_channel",
      isDelayedResponse: true
    },
    headers: {
      "Content-Type": "application/json"
    }
  };
  await rp(options);
}

/**
 *
 * @param {String} responseUrl
 */
async function assemble(request) {
  const responseUrl = request.body.response_url;
  const jstDateTime = moment()
    .tz(process.env.TIMEZONE)
    .format("YYYYMMDD-HHmm");
  const channelName = `${process.env.CHANNEL_NAME_PREFIX}_${jstDateTime}`;

  const createChannelResponse = await web.channels
    .create({
      name: channelName,
      validate: true
    })
    .catch(err => {
      return sendMessage(`Failed to Create Channel\n${err.message}`);
    });

  await sendMessage(
    `create #${createChannelResponse.channel.name} channel`,
    responseUrl
  );

  const channelID = createChannelResponse.channel.id;
  const config = await loadConfig();
  const taskList = config.tasks
    .map((task, i) => `${i + 1}. ${task}\n`)
    .join("");

  const topic = request.body.text;
  if (topic.length != 0) {
    await web.channels
      .setTopic({ channel: channelID, topic: topic })
      .catch(err => {
        return sendMessage(`Failed to set topic\n${err.message}`, responseUrl);
      });
  }

  await web.chat
    .postMessage({
      channel: channelID,
      text: taskList
    })
    .catch(error => {
      return sendMessage(
        `Failed to post tasks list\n${error.message}`,
        responseUrl
      );
    });

  const members = await getMembersByName(config.members).catch(error => {
    return sendMessage(`Failed to get members\n${error.message}`, responseUrl);
  });
  if (members.length === 0) {
    return sendMessage("Member not found", responseUrl);
  }

  await inviteMembers(members, channelID, responseUrl).catch(error => {
    return sendMessage(
      `Failed to invite members\n${error.message}`,
      responseUrl
    );
  });
}

exports.emergencySlack = async (request, response) => {
  assemble(request);
  response.status(200).send("slash command received");
};

exports.event = (event, callback) => {
  callback();
};
