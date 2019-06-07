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
        if (parameters.text.match(/^ *help *$/) != null) {
            response_body.text = createHelpMarkdown();
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

    const re = /^ *<(@\w+)(?:[|]\w+)?> *(.+)?$/;
    const deltaRe = /([A-Za-z$]+) *: *([0-9+\-]+) *(?:: *([^,]+))?/;

    const playerMatch = re.exec(parameters.text);

    if (parameters.text.match(/hist(?:ory)? *(|all|\d+) *$/)) {
        const hist_match = parameters.text.match(/hist(?:ory)? *(|all|\d+) *$/);
        let offset = 0, txt = "*History*\n";

        if (hist_match[1] == "all") offset += 0;
        else if (+hist_match[1] > 0) offset = game_data.length - hist_match[1];
        else offset = game_data.length - 10;

        for (const action of game_data.slice(offset)) {
            txt += `${offset}: ${action[0]} changed ${GAME_TRANSLATION.has(action[1]) ? GAME_TRANSLATION.get(action[1]) : TRANSLATION.get(action[1])} by ${(action[2] > 0 ? "+" : "") + action[2]}`;
            if (action.length > 3 && action[3] != null)
                txt += ` with ${action[3]}`;
            txt += "\n";
            offset += 1;
        }

        await axios.post(parameters.response_url, createMessage(txt));
    }
    else if (parameters.text.match(/start (.+)/) != null) {
        console.log("start");
        if (game_data != null && game_data.length == 0) {
            let new_game_data = [["Game", "gen", 0], ["Game", "temp", -30], ["Game", "oxy", 0], ["Game", "lake", 0]];
            for (const user of parameters.text.match(/start (.+)/)[1].split(" ")) {
                const user_match = user.match(re);
                if (user_match != null && user_match[1] != null) {
                    const new_player = [...addPlayer(user_match[1])];
                    new_game_data = new_game_data.concat(new_player);
                }
            }

            console.log(JSON.stringify(new_game_data));

            await putBlob(config, new_game_data);

            await axios.post(parameters.response_url, createMessage(`Started a new game`, true, "in_channel"));
        }
        else await axios.post(parameters.response_url, createMessage(`Cannot start a new game, one already exists!`, true, "ephemeral"));
    }
    else if (parameters.text.match(/generate/) != null) {
        const new_data = generate(game_data);

        await putBlob(config, game_data.concat(new_data));

        await axios.post(parameters.response_url, createMessage(`Applied updates : ${JSON.stringify(new_data)}`, true, "in_channel"));
    }
    else if (playerMatch != null && playerMatch.length > 1 && playerMatch[1] != null) {
        const user = parameters.user_id;
        const player = `<${playerMatch[1]}>`;
        const command = playerMatch[2];

        if (command != null) {
            let txt = "Applied updates:\n";
            const new_data = [];
            for (const action of command.split(",")) {
                const delta_match = action.match(deltaRe);
                if (delta_match != null && delta_match.length >= 3) {
                    const prop = delta_match[1].toLowerCase();
                    const val = delta_match[2];
                    const name = delta_match[3];
                    new_data.push([player, prop, val, name]);
                    txt += `${player} changed ${GAME_TRANSLATION.has(prop) ? GAME_TRANSLATION.get(prop) : TRANSLATION.get(prop)} by ${(val > 0 ? "+" : "") + val}`;
                    if (name != null) 
                        txt += ` with card ${name}`;
                    txt += "\n";
                }
            }

            await putBlob(config, game_data.concat(new_data));

            await axios.post(parameters.response_url, createMessage(txt, true, "in_channel"));
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

function evaluateGameData(game_data, translate = true) {
    const result = new Map();

    for (const action of game_data) {
        let key = action[0];
        const resource = action[1].toLowerCase();
        let resource_name = (translate && TRANSLATION.has(resource)) ? TRANSLATION.get(resource) : resource;
        const resource_value = +action[2];

        if (GAME_TRANSLATION.has(resource)) {
            key = "Game";
            if (translate)
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

function generate(game_data) {
    console.log("Generate called");
    const new_data = [];

    for (const [player, data] of evaluateGameData(game_data, false)) {
        if (player != "Game") {
             // Change energy to heat
            const energy = data.get("p");
            if (energy != null && energy != 0) {
                new_data.push([player, "h", data.get("p")]);
                new_data.push([player, "p", -data.get("p")]);
            }

            // Production to resource
            for (const [resource, value] of data.entries()) {
                const match = resource.match(/^(.+)[p$]$/);
                if (match != null && value != 0) {
                    console.log(`Add ${value} to ${match[1]} for ${player}`);
                    new_data.push([player, match[1], value]);
                }
            }

            // TR as money
            console.log(player, "$", data.get("tr"));
            new_data.push([player, "$", data.get("tr")]);
        }
    }

    new_data.push(["Game", "gen", 1]);

    return new_data;
}

function* addPlayer(player) {
    for (const resource of TRANSLATION.keys()) {
        yield [player, resource, resource == "tr" ? 20 : 0];
    }
}

function createHelpMarkdown() {
    let msg = "*Abbreviation list:*\n\n";

    for (const [resource, name] of TRANSLATION.entries()) {
        msg += `${resource.padEnd(5, " ")} : ${name}\n`
    }

    msg += "\n";

    for (const [resource, name] of GAME_TRANSLATION.entries()) {
        msg += `${resource.padEnd(5, " ")} : ${name}\n`
    }

    msg += "";

    return msg;
}