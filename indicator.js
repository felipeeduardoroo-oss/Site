// ============================================================
// INDICATOR MODULE – SMC + MTF (v3.3.0)
// Todas as funções de análise e sinais – atualizado com:
// - Fractais de Ordem 3 (anti-ruído)
// - RSI corrigido e rebalanceamento de score
// - Slope no HTF (filtro de lateral)
// - Choppiness Index
// - Funding Hard Limits ampliados
// - Ajustes de peso no Confidence Score
// ============================================================

export const calcEMA = (data, period) => {
    if (!data || data.length === 0) return [];
    const result = [];
    const mult = 2 / (period + 1);
    let ema = data[0];
    result.push(ema);
    for (let i = 1; i < data.length; i++) {
        ema = (data[i] - ema) * mult + ema;
        result.push(ema);
    }
    return result;
};

export const calculateATR = (candles, period = 14, lookback = 100) => {
    const data = candles.slice(-Math.max(lookback, period + 1));
    if (data.length < period + 1) return 0;
    const tr = [];
    for (let i = 1; i < data.length; i++) {
        const high = data[i].high;
        const low = data[i].low;
        const prevClose = data[i - 1].close;
        tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
    }
    let atr = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < tr.length; i++) {
        atr = (atr * (period - 1) + tr[i]) / period;
    }
    return atr;
};

export const calculateVWAP = (candles) => {
    if (!candles || candles.length === 0) return 0;
    let sum = 0, vol = 0;
    for (const c of candles) {
        const typical = (c.high + c.low + c.close) / 3;
        sum += typical * c.volume;
        vol += c.volume;
    }
    return vol > 0 ? sum / vol : 0;
};

export const calculateADX = (candles, period = 14, lookback = 50) => {
    const data = candles.slice(-Math.max(lookback, period * 2 + 1));
    if (data.length < period * 2 + 1) return { adx: 0, plusDI: 0, minusDI: 0 };
    const high = data.map(c => c.high);
    const low = data.map(c => c.low);
    const close = data.map(c => c.close);
    const tr = [], plusDM = [], minusDM = [];
    for (let i = 1; i < data.length; i++) {
        const h = high[i], l = low[i], pc = close[i - 1];
        tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
        const up = h - high[i - 1];
        const down = low[i - 1] - l;
        plusDM.push((up > down && up > 0) ? up : 0);
        minusDM.push((down > up && down > 0) ? down : 0);
    }
    let atr = tr.slice(0, period).reduce((a, b) => a + b, 0);
    let plus = plusDM.slice(0, period).reduce((a, b) => a + b, 0);
    let minus = minusDM.slice(0, period).reduce((a, b) => a + b, 0);
    const dxArr = [];
    for (let i = period; i < tr.length; i++) {
        atr = (atr * (period - 1) + tr[i]) / period;
        plus = (plus * (period - 1) + plusDM[i]) / period;
        minus = (minus * (period - 1) + minusDM[i]) / period;
        const plusDI = atr > 0 ? (plus / atr) * 100 : 0;
        const minusDI = atr > 0 ? (minus / atr) * 100 : 0;
        const sum = plusDI + minusDI;
        const dx = sum > 0 ? (Math.abs(plusDI - minusDI) / sum) * 100 : 0;
        dxArr.push(dx);
    }
    let adx = 0;
    if (dxArr.length >= period) {
        const start = dxArr.length - period;
        let sum = 0;
        for (let i = start; i < dxArr.length; i++) sum += dxArr[i];
        adx = sum / period;
    } else if (dxArr.length > 0) adx = dxArr.reduce((a, b) => a + b, 0) / dxArr.length;
    const finalPlusDI = atr > 0 ? (plus / atr) * 100 : 0;
    const finalMinusDI = atr > 0 ? (minus / atr) * 100 : 0;
    return { adx, plusDI: finalPlusDI, minusDI: finalMinusDI };
};

export const detectRSIDivergence = (candles, rsiValues, lookback = 50) => {
    if (candles.length < lookback + 14 || rsiValues.length < lookback) return null;
    const startIdx = candles.length - lookback;
    const findPeaks = (arr, getValue) => {
        const peaks = [];
        for (let i = 2; i < arr.length - 2; i++) {
            const val = getValue(arr[i]);
            const v1 = getValue(arr[i - 1]), v2 = getValue(arr[i - 2]);
            const v3 = getValue(arr[i + 1]), v4 = getValue(arr[i + 2]);
            if (val > v1 && val > v2 && val > v3 && val > v4) peaks.push({ index: i, value: val });
        }
        return peaks;
    };
    const findTroughs = (arr, getValue) => {
        const troughs = [];
        for (let i = 2; i < arr.length - 2; i++) {
            const val = getValue(arr[i]);
            const v1 = getValue(arr[i - 1]), v2 = getValue(arr[i - 2]);
            const v3 = getValue(arr[i + 1]), v4 = getValue(arr[i + 2]);
            if (val < v1 && val < v2 && val < v3 && val < v4) troughs.push({ index: i, value: val });
        }
        return troughs;
    };
    const priceSlice = candles.slice(startIdx);
    const rsiSlice = rsiValues.slice(startIdx);
    const priceHighs = findPeaks(priceSlice, c => c.high);
    const priceLows = findTroughs(priceSlice, c => c.low);
    const rsiHighs = findPeaks(rsiSlice, v => v);
    const rsiLows = findTroughs(rsiSlice, v => v);
    if (priceHighs.length >= 2 && rsiHighs.length >= 2) {
        const p1 = priceHighs[priceHighs.length - 2];
        const p2 = priceHighs[priceHighs.length - 1];
        const r1 = rsiHighs[rsiHighs.length - 2];
        const r2 = rsiHighs[rsiHighs.length - 1];
        const drop = r1.value - r2.value;
        if (p2.value > p1.value && r2.value < r1.value && drop >= 5 && r1.value > 55) {
            return { type: 'BEARISH_REGULAR', strength: drop / r1.value };
        }
    }
    if (priceLows.length >= 2 && rsiLows.length >= 2) {
        const p1 = priceLows[priceLows.length - 2];
        const p2 = priceLows[priceLows.length - 1];
        const r1 = rsiLows[rsiLows.length - 2];
        const r2 = rsiLows[rsiLows.length - 1];
        const rise = r2.value - r1.value;
        if (p2.value < p1.value && r2.value > r1.value && rise >= 5 && r1.value < 45) {
            return { type: 'BULLISH_REGULAR', strength: rise / r1.value };
        }
    }
    return null;
};

// ========== MELHORIAS ESTRUTURAIS ==========

// 1. Fractais de Ordem 3 (anti-ruído)
export const updateSwingPoints = (state) => {
    const candles = state.candles1H || [];
    if (candles.length < 7) return;
    const c1 = candles[candles.length - 7];
    const c2 = candles[candles.length - 6];
    const c3 = candles[candles.length - 5];
    const c4 = candles[candles.length - 4];
    const c5 = candles[candles.length - 3];
    const c6 = candles[candles.length - 2];
    const c7 = candles[candles.length - 1];
    if (c4.high > c1.high && c4.high > c2.high && c4.high > c3.high && 
        c4.high > c5.high && c4.high > c6.high && c4.high > c7.high) {
        state.swingHighs.push(c4.high);
        if (state.swingHighs.length > 20) state.swingHighs.shift();
    }
    if (c4.low < c1.low && c4.low < c2.low && c4.low < c3.low && 
        c4.low < c5.low && c4.low < c6.low && c4.low < c7.low) {
        state.swingLows.push(c4.low);
        if (state.swingLows.length > 20) state.swingLows.shift();
    }
};

// 2. HTF com Slope (filtro de lateral)
export const detectHTFStructure = (candles4H) => {
    if (!candles4H || candles4H.length < 55) return { bias: 'NEUTRAL', lastSwingHigh: 0, lastSwingLow: Infinity };
    const closes = candles4H.map(c => c.close);
    const last = closes[closes.length - 1];
    const ema50Arr = calcEMA(closes, 50);
    const ema200Arr = calcEMA(closes, 200);
    const ema50 = ema50Arr.slice(-1)[0] || last;
    const ema200 = ema200Arr.slice(-1)[0] || last;
    const ema50Prev = ema50Arr.slice(-6, -5)[0] || ema50;
    const slope = ema50 - ema50Prev;
    let bias = 'NEUTRAL';
    if (last > ema50 && ema50 > ema200 && slope > 0) {
        bias = 'BULLISH';
    } else if (last < ema50 && ema50 < ema200 && slope < 0) {
        bias = 'BEARISH';
    }
    return { 
        bias, 
        lastSwingHigh: Math.max(...candles4H.map(c => c.high)), 
        lastSwingLow: Math.min(...candles4H.map(c => c.low)) 
    };
};

// 3. Choppiness Index (filtro anti-range)
export const calculateChoppinessIndex = (candles, period = 14) => {
    if (candles.length < period) return 50;
    const data = candles.slice(-period);
    let atrSum = 0;
    let highestHigh = -Infinity;
    let lowestLow = Infinity;
    for (let i = 0; i < data.length; i++) {
        const high = data[i].high;
        const low = data[i].low;
        const close = data[i].close;
        const prevClose = i > 0 ? data[i-1].close : close;
        const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
        atrSum += tr;
        if (high > highestHigh) highestHigh = high;
        if (low < lowestLow) lowestLow = low;
    }
    if (atrSum === 0 || highestHigh === lowestLow) return 50;
    const ci = (100 * Math.log10(atrSum / (highestHigh - lowestLow))) / Math.log10(period);
    return ci;
};

// 4. Funding Hard Limits mais amplos
export const checkDerivativesFilter = (fundingRate, oiDelta) => {
    if (fundingRate > 0.0020) return { allow: false, reason: 'Funding extremamente positivo (>0.2%)' };
    if (fundingRate < -0.0020) return { allow: false, reason: 'Funding extremamente negativo (<-0.2%)' };
    if (Math.abs(oiDelta) > 20) return { allow: false, reason: 'OI Delta extremo (>20%)' };
    return { allow: true, reason: 'OK' };
};

export const checkLateralMarket = (adxValue, threshold = 20) => adxValue < threshold;

export const detectVolumeAnomaly = (candles, period = 20, threshold = 1.5) => {
    if (candles.length < period) return null;
    const volumes = candles.map(c => c.volume);
    const avg = volumes.slice(-period).reduce((a, b) => a + b, 0) / period;
    const last = volumes[volumes.length - 1];
    const ratio = avg > 0 ? last / avg : 1;
    if (ratio > threshold) return { type: 'HIGH', ratio };
    if (ratio < 1 / threshold) return { type: 'LOW', ratio };
    return null;
};

export const KellyPositionSize = (winRate, rr) => {
    if (winRate <= 0 || winRate >= 1) return 0.02;
    if (rr <= 0) return 0.02;
    const k = (winRate * (rr + 1) - 1) / rr;
    return Math.min(Math.max(k, 0.01), 0.1);
};

// ========== SCORE E CONFIANÇA REBALANCEADOS ==========

// 5. computeScore com RSI corrigido e MTF como motor principal
export const computeScore = (symbol, assetsData, liqMap, adxThreshold) => {
    const data = assetsData[symbol];
    if (!data) return { score: 50, direction: 'NEUTRAL', components: {}, blockReason: 'Sem dados' };
    const base = 50;
    const mtfScore = data.mtfConfluence?.score || 0;
    const adxRaw = data.adx;
    const adxValue = typeof adxRaw === 'object' ? (adxRaw?.adx || 0) : (adxRaw || 0);
    const rsi = data.rsi_1H || 50;
    let score = base;
    // MTF motor principal (peso 15)
    if (mtfScore > 0) score += 15;
    else if (mtfScore < 0) score -= 15;
    // ADX reforça (peso 10)
    if (adxValue > adxThreshold) {
        score += (mtfScore > 0 ? 10 : (mtfScore < 0 ? -10 : 0));
    }
    // RSI como filtro de exaustão (CORRIGIDO: penaliza sobrecompra/sobrevenda)
    if (rsi > 75) score -= 15;
    if (rsi < 25) score += 15;
    let clamped = Math.max(0, Math.min(100, score));
    const isLateral = checkLateralMarket(adxValue, adxThreshold);
    let blockReason = null;
    if (isLateral) {
        clamped = Math.max(40, Math.min(60, clamped));
        blockReason = 'Lateralização detectada';
    }
    return {
        score: clamped,
        direction: clamped >= 60 ? 'LONG' : clamped <= 40 ? 'SHORT' : 'NEUTRAL',
        components: { mtf: mtfScore > 0 ? 'ALINHADO' : 'NEUTRO', smc: 'NEUTRO', mom: adxValue > adxThreshold ? 'FORTE' : 'FRACO', of: 'NEUTRO', macro: 'NEUTRO', oi: data.oiDelta > 0 ? 'CRESCENDO' : 'DIMINUINDO' },
        blockReason
    };
};

// 6. calculateConfidenceScore com ajustes de peso (ADX e divergência)
export const calculateConfidenceScore = ({ 
    mtfAligned, mtfAlignedParcial, adx, volumeAnomaly, fundingRate, 
    openInterestTrend, divergence, macroBlackout, smcStructure, 
    direction, scoreMinLong = 60, scoreMaxShort = 40 
}) => {
    let score = 50;
    const reasons = [];
    const sign = direction === 'SHORT' ? -1 : 1;

    if (mtfAligned) { 
        score += sign * 18; 
        reasons.push('MTF alinhado'); 
    } else if (mtfAlignedParcial) { 
        score += sign * 8; 
        reasons.push('MTF parcialmente alinhado'); 
    } else { 
        score -= sign * 12; 
        reasons.push('MTF desalinhado'); 
    }
    
    const adxVal = typeof adx === 'object' ? adx.adx : adx;
    if (adxVal >= 25) { 
        score += sign * 15; 
        reasons.push(`ADX ${adxVal.toFixed(1)} forte`); 
    } else if (adxVal >= 20) { 
        score += sign * 7; 
        reasons.push(`ADX ${adxVal.toFixed(1)} formando`); 
    } else { 
        score -= sign * 15; // penalidade maior para laterais
        reasons.push(`ADX ${adxVal.toFixed(1)} lateral/fraco`); 
    }
    
    if (volumeAnomaly) {
        if (volumeAnomaly.type === 'HIGH') { 
            score += sign * 10; 
            reasons.push('Volume alto'); 
        } else if (volumeAnomaly.type === 'LOW') { 
            score -= sign * 5; 
            reasons.push('Volume baixo'); 
        }
    }
    
    if (smcStructure === 'BOS') { 
        score += sign * 5; 
        reasons.push('BOS confirmado'); 
    }
    
    const FUNDING_PENALTY = 18;
    const FUNDING_BONUS = 8;
    if (direction === 'LONG') {
        if (fundingRate > 0.0006) { score -= FUNDING_PENALTY; reasons.push('Funding elevado (LONG)'); }
        else if (fundingRate < 0) { score += FUNDING_BONUS; reasons.push('Funding negativo (LONG)'); }
    } else if (direction === 'SHORT') {
        if (fundingRate < -0.0006) { score -= FUNDING_PENALTY; reasons.push('Funding negativo (SHORT)'); }
        else if (fundingRate > 0) { score += FUNDING_BONUS; reasons.push('Funding positivo (SHORT)'); }
    }
    
    if (divergence) {
        if (divergence.type === 'BULLISH_REGULAR' && direction === 'LONG') { 
            score += 15; // bônus maior
            reasons.push('Divergência RSI altista confirmada'); 
        } else if (divergence.type === 'BEARISH_REGULAR' && direction === 'SHORT') { 
            score += 15; 
            reasons.push('Divergência RSI baixista confirmada'); 
        }
    }
    
    if (macroBlackout) { score -= 20; reasons.push('Macro blackout'); }
    
    if (openInterestTrend === 'INCREASING' && direction === 'LONG') { score += 5; reasons.push('OI crescente LONG'); }
    else if (openInterestTrend === 'DECREASING' && direction === 'SHORT') { score += 5; reasons.push('OI decrescente SHORT'); }
    
    score = Math.min(100, Math.max(0, score));
    let level = 'MEDIUM';
    if (score >= 75) level = 'VERY_HIGH';
    else if (score >= 60) level = 'HIGH';
    else if (score >= 40) level = 'MEDIUM';
    else if (score >= 20) level = 'LOW';
    else level = 'VERY_LOW';
    
    let finalDirection = 'NEUTRO';
    if (score >= scoreMinLong) finalDirection = 'LONG';
    else if (score <= scoreMaxShort) finalDirection = 'SHORT';
    return { score, level, direction: finalDirection, reasons };
};
