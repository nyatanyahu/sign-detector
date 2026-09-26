let playerCoords = new Map();

register('packetReceived', (packet, event) => {
    if (packet instanceof net.minecraft.network.packet.s2c.play.BlockEntityUpdateS2CPacket) {
        analyzeSignPackets(packet);
    }
});

function print(text) {
    // call rendersystem from rendering thread
    Client.scheduleTask(() => ChatLib.chat(text));
}

function analyzeSignPackets(packet) {
    let field = packet.class.getDeclaredField('field_12039');

    field.setAccessible(true);

    let nbt = field.get(packet);

    // only parse if it's a sign
    if (nbt.get('id') != '"Sign"') return;

    // xyz
    let x = parseInt(nbt.get('x'));
    let y = parseInt(nbt.get('y'));
    let z = parseInt(nbt.get('z'));

    // text
    let front_text = nbt.getCompound('front_text').get();
    let messages = front_text.get('messages');
    let parsedMessages = [];
    let hasText = false;
    
    for (let i = 0; i < messages.size(); i++) {
        let message = messages[i];
        
        if (!message.contains('extra')) {
            parsedMessages.push('');
            continue;
        }

        parsedMessages.push(message.get('extra')[0].get('text'));
        hasText = true;
    }

    print('&8[&6sign-detect&8] &8-----------------------------------------');

    if (hasText == true) {
        print(`&8[&6sign-detect&8] &6Sign edited at &a(${x}, ${y}, ${z})!`);
        
        notifySignText(parsedMessages);
    } else print(`&8[&6sign-detect&8] &6Sign placed at &a(${x}, ${y}, ${z})!`);
    
    let { possiblePlayers, likelyPlayers } = predictPlayer(x, y, z);

    print(`&8[&6sign-detect&8] &6Possible players: &a${JSON.stringify(possiblePlayers)}`);
    print(`&8[&6sign-detect&8] &6Likely players: &a${JSON.stringify(likelyPlayers)}`);
    print('&8[&6sign-detect&8] &8-----------------------------------------');
}

function notifySignText(messages) {
    for (let i = 0; i < messages.length; i++) print(`&8[&6sign-detect&8] &6Line ${i + 1}: &r${messages[i]}`);
}

const YAW_THRESHOLD = 10;
const PITCH_THRESHOLD = 10;

function predictPlayer(x, y, z) {
    let possiblePlayers = [];
    let likelyPlayers = [];

    for (let entry of playerCoords) {
        let name = entry[0];
        let coords = entry[1];
        let recent = coords[coords.length - 1];

        // store info for most optimal offset
        let minDist = Number.MAX_SAFE_INTEGER;
        let minYawDiff = Number.MAX_SAFE_INTEGER;
        let minPitchDiff = Number.MAX_SAFE_INTEGER;

        // tests the middle and the corner of the block
        let offsets = [0, 0.5, 1];

        // test all combinations of the offsets
        for (let i = 0; i < offsets.length; i++) {
            let ox = offsets[i];

            for (let j = 0; j < offsets.length; j++) {
                let oy = offsets[j];

                for (let k = 0; k < offsets.length; k++) {
                    let oz = offsets[k];
                    let tx = x + ox;
                    let ty = y + oy;
                    let tz = z + oz;
                    let dx = tx - recent.x;
                    let dy = ty - recent.y - 1.62; // subtract 1.62 for diff between feet and eyes
                    let dz = tz - recent.z; 
                
                    // calculate 3d euclidean distance between player and sign (if more than 4.5b, then impossible)
                    let dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

                    if (dist < minDist) minDist = dist;

                    let h_dist = Math.sqrt(dx * dx + dz * dz);
                    let yawToSign = Math.atan2(-dx, dz) * (180 / Math.PI);
                    let pitchToSign = -Math.atan2(dy, h_dist) * (180 / Math.PI);
                    let yawDiff = Math.min(Math.abs(recent.yaw - yawToSign), 360 - Math.abs(recent.yaw - yawToSign));
                    let pitchDiff = Math.min(Math.abs(recent.pitch - pitchToSign), 360 - Math.abs(recent.pitch - pitchToSign));

                    // when pitch is close to -90 or 90, yaw matters less and less (produces same camera angle), so add weight based on pitch value
                    let yawWeight = Math.abs(Math.cos(recent.pitch * Math.PI / 180));

                    yawDiff *= yawWeight;

                    if (yawDiff < minYawDiff) minYawDiff = yawDiff;
                    if (pitchDiff < minPitchDiff) minPitchDiff = pitchDiff;
                }
            }
        }

        if (minDist >= 5) continue;

        possiblePlayers.push(name);

        // print(`Player: ${name}, yawDiff: ${minYawDiff}, pitchDiff: ${minPitchDiff}, dist: ${minDist}`);

        if (minYawDiff > YAW_THRESHOLD || minPitchDiff > PITCH_THRESHOLD) continue;

        likelyPlayers.push(name);
    }

    return { possiblePlayers, likelyPlayers };
}

register('chat', (data) => {
    let json = JSON.parse(data);
    let name = json.name;
    let x = json.x;
    let y = json.y;
    let z = json.z;
    let yaw = json.yaw;
    let pitch = json.pitch;

    if (!playerCoords.has(name)) playerCoords.set(name, [{x: x, y: y, z: z, yaw: yaw, pitch: pitch }]);
    else {
        let coords = playerCoords.get(name);

        coords.push({ x: x, y: y, z: z, yaw: yaw, pitch: pitch });
    }
}).setChatCriteria('* info: ${data}');