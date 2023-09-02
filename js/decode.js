/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x: number, y: number}} begin
 * @param {{x: number, y: number}} end
 */
function drawLine(ctx, begin, end) {
    ctx.beginPath();
    ctx.moveTo(begin.x, begin.y);
    ctx.lineTo(end.x, end.y);
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#ff0000';
    ctx.stroke();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{location: {
 *   topLeftCorner: {x: number, y: number},
 *   topRightCorner: {x: number, y: number},
 *   topRightCorner: {x: number, y: number},
 *   bottomRightCorner: {x: number, y: number},
 *   bottomRightCorner: {x: number, y: number},
 *   bottomLeftCorner: {x: number, y: number},
 *   bottomLeftCorner: {x: number, y: number},
 *   topLeftCorner: {x: number, y: number},
 * }}} code
 */
function drawQrcodeRegion(ctx, code) {
    drawLine(ctx, code.location.topLeftCorner, code.location.topRightCorner);
    drawLine(ctx, code.location.topRightCorner, code.location.bottomRightCorner);
    drawLine(ctx, code.location.bottomRightCorner, code.location.bottomLeftCorner);
    drawLine(ctx, code.location.bottomLeftCorner, code.location.topLeftCorner);
}

/**
 * @param {ArrayBuffer} qrcodeBuffer
 * @returns {{
 * blockIndex: number,
 * blockOffset: number,
 * blockData: Uint8ClampedArray,
 * fileName?: string,
 * fileLength?: number,
 * blockSize?: number,
 * lastBlockIndex?: number,
 * }}
 */
function parseQRcodeBuffer(qrcodeBuffer) {
    const view = new DataView(qrcodeBuffer);
    const blockIndex = view.getUint32(0, true);
    const blockOffset = view.getUint32(4, true);
    const blockData = new Uint8ClampedArray(qrcodeBuffer, 8, qrcodeBuffer.byteLength - 8);
    if (blockIndex === 0) {
        const fileInfo = JSON.parse(Array.from(blockData).map(c => String.fromCodePoint(c)).join(''));
        return {
            blockIndex,
            blockOffset,
            blockData,
            fileName: fileInfo.fileName,
            fileLength: fileInfo.fileLength,
            blockSize: fileInfo.blockSize,
            lastBlockIndex: fileInfo.lastBlockIndex,
        };
    }
    return {
        blockIndex,
        blockOffset,
        blockData,
    };
}


const video = document.createElement('video');
function start(startType) {
    // const canvas = document.querySelector('#canvas');
    // document.body.append(canvas);
    // const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let mediaType = {
        0:{
            video: {
                facingMode: 'environment',
                width: 1920,
                height: 1080,
            }
        },
        1:{ audio: true }
    }
    const handleStream = (stream) => {
        video.srcObject = stream;
        video.setAttribute('playsinline', true); // required to tell iOS safari we don't want fullscreen
        video.play();
    }
    if(startType == 0){
        navigator.mediaDevices.getUserMedia(mediaType[startType]).then(handleStream);
    }else{
        navigator.mediaDevices.getDisplayMedia().then(handleStream);
    }
    stopTickVideo = false;
    tickVideo(true)
}

let fileName = 'file';
let fileData = null;
let blockCount = null;
let remainingBlockIndexSet = null;
const canvas = document.querySelector('#canvas');
const progressBarCanvas = document.querySelector('#progress-bar');
let stopTickVideo = true;
const tickVideo = (isRequestAnimationFrame) => {
    if(stopTickVideo){
        return;
    }
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
        ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
        const imageData = ctx.getImageData(0, 0, video.videoWidth, video.videoHeight);
        const t0 = Date.now();
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert',
        });
        const t1 = Date.now();
        if (code) {
            drawQrcodeRegion(ctx, code);
            if (code.binaryData.length > 8) {
                new Promise((resolve, reject) => {
                    let result = parseQRcodeBuffer(new Uint8ClampedArray(code.binaryData).buffer);
                    if(result){
                        resolve(result) 
                    }else{
                        reject()
                    }
                }).then((result) => {
                    
                    if (result.blockIndex === 0) {
                        if (result.fileName !== fileName || result.fileLength !== fileData.byteLength) {
                            fileName = result.fileName;
                            fileData = new Uint8ClampedArray(result.fileLength);
                            blockCount = result.lastBlockIndex;
                            remainingBlockIndexSet = new Set();
                            for (let i = 1; i <= result.lastBlockIndex; i++) {
                                remainingBlockIndexSet.add(i);
                            }
                            document.querySelector('#file-name').textContent = `${result.fileName}`;
                            document.querySelector('#file-length').textContent = `${result.fileLength}`;
                            document.querySelector('#speed').textContent = `${t1 - t0}`;
                            document.querySelector('#finished-block-count').textContent = `1`;
                            document.querySelector('#all-block-count').textContent = `${blockCount}`;
                            progressBarSetProgress(document.querySelector('#progress-bar'), result.blockIndex / blockCount, '#390', '#ccc');
                        }
                    } else {
                        if (fileData) {
                            (new Uint8ClampedArray(fileData.buffer, result.blockOffset, result.blockData.length)).set(result.blockData);
                            remainingBlockIndexSet.delete(result.blockIndex);
                            document.querySelector('#finished-block-count').textContent = `${blockCount - remainingBlockIndexSet.size}`;
                            progressBarSetProgress(document.querySelector('#progress-bar'), result.blockIndex / blockCount, '#390', '#ccc');
                        }
                    }
                    console.log(fileName, result.blockIndex,(remainingBlockIndexSet ? remainingBlockIndexSet.size : 0));
                })
            }
        }
    }
    if(isRequestAnimationFrame){
        requestAnimationFrame(() => tickVideo(isRequestAnimationFrame));
    }
    
}

function progressBarSetProgress(el, progress, frontColor, backgroundColor) {
    el.style.background = `linear-gradient(to right, ${frontColor} 0%, ${frontColor} ${progress * 100}%, ${backgroundColor} ${progress * 100}%, ${backgroundColor} 100%)`;
}

window.onload = function () {
    document.body.append(canvas);
    document.querySelector('#reset-button').addEventListener('click', () => {
        fileName = 'file';
        fileData = null;
        blockCount = null;
        remainingBlockIndexSet = null;
    });
    document.querySelector('#download-button').addEventListener('click', () => {
        if (fileData) {
            const blob = new Blob([fileData], { type: 'application/octet-stream' });
            saveAs(blob, fileName);
        }
    });
    video.addEventListener("loadedmetadata", () => {
        document.querySelector('#canvas').width = video.videoWidth;
        document.querySelector('#canvas').height = video.videoHeight;
    });
    video.addEventListener("timeupdate", () => {
        tickVideo(false);
    });

    document.querySelector('#start-button').addEventListener('click', () => {
        const startType = document.querySelector('[name="startType"]:checked').value;
        if(!startType){
            alert("请选择启动方式")
            return;
        }
        let btnText = document.querySelector('#start-button').textContent;
        /* reset btn text */
        document.querySelector('#start-button').textContent = "Start";
        if(btnText == "Start"){
            start(startType);
            document.querySelector('#start-button').textContent = "Stop";
            return;
        }
        progressBarSetProgress(document.querySelector('#progress-bar'), 0, '#390', '#ccc');
        video.srcObject = null;
        fileName = 'file';
        fileData = null;
        blockCount = null;
        remainingBlockIndexSet = null;
        stopTickVideo = true;
    });
}