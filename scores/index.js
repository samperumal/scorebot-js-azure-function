const {
    getBlob,
    putBlob
} = require("../common/azure-storage");

const axios = require('axios');
const { parse } = require('querystring');

const resources = [
    "tr",
    "money",
    "iron",
    "titanium",
    "greenery",
    "power",
    "heat",
    "cards"
];

function timing() {
    const d = new Date();
    return d.getSeconds() * 1000 + d.getMilliseconds();
}

module.exports = async function (context, req) {
    context.log('JavaScript HTTP trigger function processed a request.');

    const response_body = createMessage(`Processing request...`);

    // start async processing
    if (req.body != "") {
        const parameters = parse(req.body);

        if (parameters.token != process.env["slack_token"]) {
            response_body.text += `Error: ${parameters.token} != ${process.env["slack_token"]}`;
        }
        else if (parameters.team_id != process.env["team_id"]) {
            response_body.text += `Error: ${parameters.token} != ${process.env["team_id"]}`;
        }
        else processCommand(parameters);
    }

    // return immediately
    context.res = {
        headers: {
            'Content-Type': "application/json"
        },
        body: response_body
    };
}

async function processCommand(parameters) {
    const start = timing();

    const config = {
        azure_account: process.env["azure_account"],
        azure_account_key: process.env["azure_account_key"],
        containerName: process.env["azure_container"],
        blobName: parameters.channel_id,
        default: () => ([]),
    };

    const game_data = await getBlob(config);

    const re = /^ *<(@\w+)(?:[|]\w+)?> (.+)?$/;
    const deltaRe = /([A-Za-z$]+) *: *([0-9+\-]+)/;

    const playerMatch = re.exec(parameters.text);

    if (playerMatch != null && playerMatch.length > 1 && playerMatch[1] != null) {
        const user = parameters.user_id;
        const player = `<${playerMatch[1]}>`;
        const command = playerMatch[2];

        if (command != null) {
            const new_data = [];
            for (const action of command.split(",")) {
                const delta_match = action.match(deltaRe);
                if (delta_match != null && delta_match.length == 3) {
                    const prop = delta_match[1];
                    const val = delta_match[2];
                    new_data.push([player, prop, val]);
                }
            }

            await putBlob(config, game_data.concat(new_data));

            await axios.post(parameters.response_url, createMessage(`Applied updates : ${JSON.stringify(new_data)}`, true, "in_channel"));
        }
        else {
            await axios.post(parameters.response_url, createMessage("No command provided", true));
        }
    }
    else {
        try {
            const msg = createScoreTable(game_data);
            await axios.post(parameters.response_url, msg);
        }
        catch (err) {
            await axios.post(parameters.response_url, createMessage(`Error: ${err.stack}`));
        }
    }
}

function createMessage(msg, replace_original = false, type = "ephemeral") {
    return {
        response_type: type,
        text: msg,
        replace_original: new Boolean(replace_original).toString()
    };
}

const TRANSLATION = new Map([
    ["tr", "TR"],
    ["c", "Cards"],
    ["$", "$"],
    ["$$", "$ Prod"],
    ["s", "Steel"],
    ["sp", "Steel Prod"],
    ["t", "Titanium"],
    ["tp", "Titanium Prod"],
    ["g", "Greenery"],
    ["gp", "Greenery Prod"],
    ["g", "Greenery"],
    ["p", "Power"],
    ["pp", "Power Prod"],
    ["h", "Heat"],
    ["hp", "Heat Prod"],    
]);

const GAME_TRANSLATION = new Map([
    ["gen", "Generation"],
    ["temp", "Temperature"],
    ["oxy", "Oxygen"],
    ["lake", "Water"]
]);

function evaluateGameData(game_data) {
    const result = new Map();

    for (const action of game_data) {
        let key = action[0];
        const resource = action[1];
        let resource_name = TRANSLATION.has(resource) ? TRANSLATION.get(resource) : resource;
        const resource_value = +action[2];

        if (GAME_TRANSLATION.has(resource)) {
            key = "Game";
            resource_name = GAME_TRANSLATION.get(resource);
        }

        if (!result.has(key)) {
            result.set(key, new Map());
        }

        const player = result.get(key);

        if (!player.has(resource_name)) {
            player.set(resource_name, 0);
        }

        player.set(resource_name, player.get(resource_name) + resource_value);
    }

    return result;
}

function createScoreTable(game_data) {
    const blocks = [];

    for (const [player, data] of evaluateGameData(game_data)) {
        blocks.push({ type: "divider" });

        let mapped = [];
        if (player != "Game") {
            for (const resource of TRANSLATION.values()) {
                mapped.push(`${resource}: ${data.has(resource) ? data.get(resource) : 0}`);
            }
        }
        else {
            for (const resource of GAME_TRANSLATION.values()) {
                mapped.push(`${resource}: ${data.has(resource) ? data.get(resource) : 0}`);
            }
        }

        const resources = mapped.join("\t");
        const markdown = `*${player}*\n${resources}`

        const block = {
            type: "section",
            text: {
                type: "mrkdwn",
                text: markdown
            }
        };

        blocks.push(block);
    }

    return {
        blocks: blocks
    };
}