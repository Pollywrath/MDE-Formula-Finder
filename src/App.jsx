import React, { useState, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const App = () => {
  const [rawData, setRawData] = useState([]);
  const [mode, setMode] = useState('cylinder');
  
  const [cylinderParams] = useState({
    baseA: 0.00009782660801279454,
    baseB: 0.00978251199152855959,
    baseC: 0.0,
    waveAmp: 0.01956600381495192040,
    waveGrow: 0.99999232491636780296,
    wavePeriod: 62.83181597823495678767,
    wavePhase: 3.14158481683757129233
  });

  const [params, setParams] = useState({
    powerA: 0.002746,
    powerN: 3.0,
    powerM: 3.0,
    linearC: 0.14,
    linearM: 1.0
  });

  const [isOptimizing, setIsOptimizing] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [bestFitness, setBestFitness] = useState(Infinity);
  const [popSize, setPopSize] = useState(100);
  const [F, setF] = useState(0.4);
  const [CR, setCR] = useState(0.5);
  const [maxGens, setMaxGens] = useState(0);
  const [log, setLog] = useState([]);
  const [showAllErrors, setShowAllErrors] = useState(false);
  const [stuckCounter, setStuckCounter] = useState(0);
  const [lastImprovement, setLastImprovement] = useState(0);
  
  const intervalRef = useRef(null);
  const fileRef = useRef(null);
  
  const addLog = (msg) => {
    setLog(prev => [...prev.slice(-5), msg]);
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const lines = e.target.result.trim().split('\n');
      if (lines.length === 0) return;

      const detectDelimiter = (line) => {
        const commaCount = (line.match(/,/g) || []).length;
        const tabCount = (line.match(/\t/g) || []).length;
        return tabCount > commaCount ? '\t' : ',';
      };

      const delimiter = detectDelimiter(lines[0]);
      
      const parsed = lines.slice(1).map(line => {
        const values = line.split(delimiter).map(v => parseFloat(v.trim()));
        return {
          cylinders: values[0],
          ratio: values[1],
          throttle: values[2],
          torque: values[3],
          fuel: values[4]
        };
      }).filter(d => !isNaN(d.cylinders) && !isNaN(d.ratio) && !isNaN(d.throttle) && !isNaN(d.fuel));

      // Deduplicate
      const seen = new Set();
      const deduped = parsed.filter(d => {
        const key = `${d.cylinders}-${d.ratio}-${d.throttle}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      setRawData(deduped);
      addLog(`Loaded: ${deduped.length} rows (${parsed.length - deduped.length} duplicates removed)`);
    };
    reader.readAsText(file);
  };

  const calcFuelPerCylinder = (c) => {
    const cp = cylinderParams;
    const base = cp.baseA * c * c + cp.baseB * c + cp.baseC;
    const amp = cp.waveAmp * Math.pow(c, cp.waveGrow);
    const wave = amp * Math.sin(2 * Math.PI * c / cp.wavePeriod + cp.wavePhase);
    return base + Math.abs(wave);
  };

  const calcFuel = (t, r, c, p) => {
    const fuelPerCyl = calcFuelPerCylinder(c);
    const powerMultiplier = p.powerA * Math.pow(t, p.powerN) / Math.pow(r, p.powerM);
    const powerFuel = powerMultiplier * fuelPerCyl;
    
    // Threshold is the fuel usage at R14 T100 for this cylinder count
    const thresholdMultiplier = p.powerA * Math.pow(100, p.powerN) / Math.pow(14, p.powerM);
    const thresholdFuel = thresholdMultiplier * fuelPerCyl;
    
    if (powerFuel < thresholdFuel) {
      return powerFuel;
    } else {
      // Find the throttle value where transition happens for this ratio
      const tThreshold = Math.pow((thresholdMultiplier * Math.pow(r, p.powerM)) / p.powerA, 1 / p.powerN);
      // Calculate linearE at the threshold point for continuity
      const linearE = thresholdMultiplier - p.linearC * tThreshold / Math.pow(r, p.linearM);
      const linearMultiplier = p.linearC * t / Math.pow(r, p.linearM) + linearE;
      return linearMultiplier * fuelPerCyl;
    }
  };

  const getFilteredData = () => {
    if (mode === 'cylinder') {
      // Group by (ratio, throttle), keep groups with 15+ entries
      const groups = new Map();
      rawData.forEach(d => {
        const key = `${d.ratio}-${d.throttle}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(d);
      });
      
      const filtered = [];
      groups.forEach(group => {
        if (group.length >= 15) filtered.push(...group);
      });
      return filtered;
    } else {
      // Group by (cylinders, ratio), keep groups with 10+ entries
      const groups = new Map();
      rawData.forEach(d => {
        const key = `${d.cylinders}-${d.ratio}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(d);
      });
      
      const filtered = [];
      groups.forEach(group => {
        if (group.length >= 10) filtered.push(...group);
      });
      return filtered;
    }
  };

  const calcFitness = (p, dataPoints) => {
    let totalPct = 0;
    let count = 0;
    
    dataPoints.forEach(d => {
      const actual = d.fuel;
      const calc = calcFuel(d.throttle, d.ratio, d.cylinders, p);
      
      const roundedCalc = Math.round(calc * 1000) / 1000;
      const roundedActual = Math.round(actual * 1000) / 1000;
      
      if (roundedActual > 0.001) {
        const pct = Math.abs((roundedCalc - roundedActual) / roundedActual * 100);
        totalPct += pct;
        count++;
      }
    });
    
    return count > 0 ? totalPct / count : Infinity;
  };

  const randomizeParams = () => {
    setParams({
      powerA: 0.001 + Math.random() * 0.01,
      powerN: 2 + Math.random() * 2,
      powerM: 2 + Math.random() * 2,
      linearC: 0.05 + Math.random() * 0.3,
      linearM: 0.5 + Math.random() * 2
    });
  };

  const startOptimization = () => {
    if (rawData.length === 0) {
      addLog('ERROR: No data loaded');
      return;
    }
    
    const activeData = rawData;
    
    addLog(`START: ${mode} mode`);
    
    const pop = [];
    const fit = [];
    
    const currentParams = params;
    
    pop.push({...currentParams});
    fit.push(calcFitness(currentParams, activeData));
    addLog(`Initial fitness: ${fit[0].toFixed(3)}%`);
    
    for (let i = 1; i < popSize; i++) {
      const ind = {
        powerA: currentParams.powerA * (0.3 + Math.random() * 1.4),
        powerN: currentParams.powerN * (0.8 + Math.random() * 0.4),
        powerM: currentParams.powerM * (0.8 + Math.random() * 0.4),
        linearC: currentParams.linearC * (0.3 + Math.random() * 1.4),
        linearM: currentParams.linearM * (0.7 + Math.random() * 0.6)
      };
      
      pop.push(ind);
      fit.push(calcFitness(ind, activeData));
    }
    
    const bestIdx = fit.indexOf(Math.min(...fit));
    const initBest = fit[bestIdx];
    setBestFitness(initBest);
    
    let currentPop = pop;
    let currentFit = fit;
    let currentBest = initBest;
    let gen = 0;
    let gensSinceImprovement = 0;
    
    intervalRef.current = setInterval(() => {
      const N = currentPop.length;
      const newPop = [];
      const newFit = [];
      
      for (let i = 0; i < N; i++) {
        let a, b, c;
        do { a = Math.floor(Math.random() * N); } while (a === i);
        do { b = Math.floor(Math.random() * N); } while (b === i || b === a);
        do { c = Math.floor(Math.random() * N); } while (c === i || c === a || c === b);
        
        if (Math.random() < 0.2) {
          a = currentFit.indexOf(Math.min(...currentFit));
        }
        
        const trial = {...currentPop[i]};
        
        if (Math.random() < CR) {
          trial.powerA = Math.max(0.0001, Math.min(0.1, currentPop[a].powerA + F * (currentPop[b].powerA - currentPop[c].powerA)));
        }
        if (Math.random() < CR) {
          trial.powerN = Math.max(1, Math.min(5, currentPop[a].powerN + F * (currentPop[b].powerN - currentPop[c].powerN)));
        }
        if (Math.random() < CR) {
          trial.powerM = Math.max(1, Math.min(5, currentPop[a].powerM + F * (currentPop[b].powerM - currentPop[c].powerM)));
        }
        if (Math.random() < CR) {
          trial.linearC = Math.max(0.01, Math.min(5, currentPop[a].linearC + F * (currentPop[b].linearC - currentPop[c].linearC)));
        }
        if (Math.random() < CR) {
          trial.linearM = Math.max(0.1, Math.min(5, currentPop[a].linearM + F * (currentPop[b].linearM - currentPop[c].linearM)));
        }
        
        const trialFit = calcFitness(trial, activeData);
        if (trialFit < currentFit[i]) {
          newPop.push(trial);
          newFit.push(trialFit);
        } else {
          newPop.push(currentPop[i]);
          newFit.push(currentFit[i]);
        }
      }
      
      currentPop = newPop;
      currentFit = newFit;
      
      const bestIdx = newFit.indexOf(Math.min(...newFit));
      const newBest = newFit[bestIdx];
      
      if (newBest < currentBest) {
        currentBest = newBest;
        setBestFitness(newBest);
        
        setParams({...newPop[bestIdx]});
        
        addLog(`✓ Gen ${gen}: ${newBest.toFixed(3)}%`);
        gensSinceImprovement = 0;
      } else {
        gensSinceImprovement++;
      }
      
      setStuckCounter(gensSinceImprovement);
      
      // Escape local minima: inject diversity if stuck for 500 generations
      if (gensSinceImprovement >= 500 && gensSinceImprovement % 500 === 0) {
        addLog(`⚠ Stuck for ${gensSinceImprovement} gens, injecting diversity...`);
        
        // Keep best 20%, randomize rest 80%
        const sortedIndices = newFit.map((f, i) => ({f, i})).sort((a, b) => a.f - b.f);
        const keepCount = Math.floor(N * 0.2);
        
        for (let i = keepCount; i < N; i++) {
          const idx = sortedIndices[i].i;
          const best = newPop[bestIdx];
          
          newPop[idx] = {
            powerA: best.powerA * (0.1 + Math.random() * 1.8),
            powerN: best.powerN * (0.7 + Math.random() * 0.6),
            powerM: best.powerM * (0.7 + Math.random() * 0.6),
            linearC: best.linearC * (0.3 + Math.random() * 1.4),
            linearM: best.linearM * (0.5 + Math.random() * 1.0)
          };
          newFit[idx] = calcFitness(newPop[idx], activeData);
        }
      }
      
      gen++;
      setGeneration(gen);
      
      if (maxGens > 0 && gen >= maxGens) {
        addLog(`Reached ${maxGens} generations`);
        clearInterval(intervalRef.current);
        setIsOptimizing(false);
      }
    }, 0);
  };

  const stopOptimization = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const handleToggle = () => {
    if (isOptimizing) {
      stopOptimization();
      setIsOptimizing(false);
    } else {
      setGeneration(0);
      setBestFitness(Infinity);
      setStuckCounter(0);
      setLastImprovement(0);
      setIsOptimizing(true);
      setTimeout(startOptimization, 100);
    }
  };

  const analysisData = rawData.map(d => {
    const actual = d.fuel;
    const calc = calcFuel(d.throttle, d.ratio, d.cylinders, params);
    
    const roundedCalc = Math.round(calc * 1000) / 1000;
    const roundedActual = Math.round(actual * 1000) / 1000;
    const err = Math.abs(actual - calc);
    const pct = roundedActual > 0.001 ? Math.abs((roundedCalc - roundedActual) / roundedActual * 100) : 0;
    const roundsCorrect = roundedActual === roundedCalc;
    
    let remainingToRound = 0;
    if (!roundsCorrect) {
      const lowerBound = actual - 0.0005;
      const upperBound = actual + 0.0005;
      if (calc < lowerBound) {
        remainingToRound = lowerBound - calc;
      } else if (calc > upperBound) {
        remainingToRound = calc - upperBound;
      }
    }
    
    return { ...d, calc, err, pct, roundsCorrect, remainingToRound };
  });

  const avgErr = analysisData.length > 0 ? analysisData.reduce((s, d) => s + d.err, 0) / analysisData.length : 0;
  const maxErr = analysisData.length > 0 ? Math.max(...analysisData.map(d => d.err)) : 0;
  const avgPct = analysisData.length > 0 ? analysisData.reduce((s, d) => s + d.pct, 0) / analysisData.length : 0;
  const correctRounds = analysisData.filter(d => d.roundsCorrect).length;
  const totalDataPoints = rawData.length;

  const allWrongValues = analysisData
    .filter(d => !d.roundsCorrect)
    .sort((a, b) => b.remainingToRound - a.remainingToRound || b.pct - a.pct);
  
  const worstValues = allWrongValues.slice(0, 10);

  const getChartData = () => {
    const chartLines = [];
    let chartData = [];
    
    if (mode === 'cylinder') {
      // Group by (ratio, throttle), keep groups with 15+ entries
      const groups = new Map();
      rawData.forEach(d => {
        const key = `${d.ratio}-${d.throttle}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(d);
      });
      
      groups.forEach((group, key) => {
        if (group.length >= 15) {
          const [ratio, throttle] = key.split('-');
          chartLines.push({ ratio, throttle, key });
        }
      });
      
      // Get all unique cylinder values across all groups
      const allCylinders = new Set();
      chartLines.forEach(line => {
        const group = groups.get(line.key);
        group.forEach(d => allCylinders.add(d.cylinders));
      });
      
      const sortedCylinders = [...allCylinders].sort((a, b) => a - b);
      
      chartData = sortedCylinders.map(c => {
        const point = { cylinders: c };
        chartLines.forEach(line => {
          const group = groups.get(line.key);
          const matches = group.filter(d => d.cylinders === c);
          if (matches.length > 0) {
            const avgFuel = matches.reduce((s, d) => s + d.fuel, 0) / matches.length;
            const avgRatio = matches.reduce((s, d) => s + d.ratio, 0) / matches.length;
            const avgThrottle = matches.reduce((s, d) => s + d.throttle, 0) / matches.length;
            point[`${line.key}_actual`] = avgFuel;
            point[`${line.key}_calc`] = calcFuel(avgThrottle, avgRatio, c, params);
          }
        });
        return point;
      });
    } else {
      // Group by (cylinders, ratio), keep groups with 10+ entries
      const groups = new Map();
      rawData.forEach(d => {
        const key = `${d.cylinders}-${d.ratio}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(d);
      });
      
      groups.forEach((group, key) => {
        if (group.length >= 10) {
          const [cylinders, ratio] = key.split('-');
          chartLines.push({ cylinders, ratio, key });
        }
      });
      
      // Get all unique throttle values across all groups
      const allThrottles = new Set();
      chartLines.forEach(line => {
        const group = groups.get(line.key);
        group.forEach(d => allThrottles.add(d.throttle));
      });
      
      const sortedThrottles = [...allThrottles].sort((a, b) => a - b);
      
      chartData = sortedThrottles.map(t => {
        const point = { throttle: t };
        chartLines.forEach(line => {
          const group = groups.get(line.key);
          const matches = group.filter(d => d.throttle === t);
          if (matches.length > 0) {
            const avgFuel = matches.reduce((s, d) => s + d.fuel, 0) / matches.length;
            const avgCylinders = matches.reduce((s, d) => s + d.cylinders, 0) / matches.length;
            point[`${line.key}_actual`] = avgFuel;
            point[`${line.key}_calc`] = calcFuel(t, parseFloat(line.ratio), avgCylinders, params);
          }
        });
        return point;
      });
    }
    
    return { chartData, chartLines };
  };

  const { chartData, chartLines } = getChartData();

  const generateFormula = () => {
    const cp = cylinderParams;
    const p = params;
    return `function calculateFuel(throttle, ratio, cylinders) {
  const t = throttle;
  const r = ratio;
  const c = cylinders;
  
  // Fuel per cylinder (fixed from cylinder optimizer)
  const base = ${cp.baseA.toExponential(15)} * c * c + ${cp.baseB.toExponential(15)} * c + ${cp.baseC.toExponential(15)};
  const amp = ${cp.waveAmp.toExponential(15)} * Math.pow(c, ${cp.waveGrow.toExponential(15)});
  const wave = amp * Math.sin(2 * Math.PI * c / ${cp.wavePeriod.toExponential(15)} + ${cp.wavePhase.toExponential(15)});
  const fuelPerCyl = base + Math.abs(wave);
  
  // Piecewise multiplier
  const powerMultiplier = ${p.powerA.toExponential(15)} * Math.pow(t, ${p.powerN.toExponential(15)}) / Math.pow(r, ${p.powerM.toExponential(15)});
  const powerFuel = powerMultiplier * fuelPerCyl;
  
  // Threshold is the fuel usage at R14 T100 for this cylinder count
  const thresholdMultiplier = ${p.powerA.toExponential(15)} * Math.pow(100, ${p.powerN.toExponential(15)}) / Math.pow(14, ${p.powerM.toExponential(15)});
  const thresholdFuel = thresholdMultiplier * fuelPerCyl;
  
  if (powerFuel > thresholdFuel) {
    const tThreshold = Math.pow((thresholdMultiplier * Math.pow(r, ${p.powerM.toExponential(15)})) / ${p.powerA.toExponential(15)}, 1 / ${p.powerN.toExponential(15)});
    const linearE = thresholdMultiplier - ${p.linearC.toExponential(15)} * tThreshold / Math.pow(r, ${p.linearM.toExponential(15)});
    const linearMultiplier = ${p.linearC.toExponential(15)} * t / Math.pow(r, ${p.linearM.toExponential(15)}) + linearE;
    return linearMultiplier * fuelPerCyl;
  } else {
    return powerFuel;
  }
}

// Stats: Avg=${avgErr.toFixed(8)} | Max=${maxErr.toFixed(8)} | Pct=${avgPct.toFixed(6)}%
// Correct: ${correctRounds}/${totalDataPoints} (${(correctRounds/totalDataPoints*100).toFixed(1)}%)`;
  };
  const colors = ['#22c55e', '#3b82f6', '#a855f7', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899'];
  const colorsDark = ['#15803d', '#1e40af', '#6b21a8', '#b45309', '#991b1b', '#0e7490', '#9f1239'];

  return (
    <div className="app-container">
      <div className="main-layout">
        <div className="left-panel">
          <div className="config-panel">
            <h3 className="config-title">📁 Data Files</h3>
            
            <div className="config-section">
              <label className="config-label-bold">Data File:</label>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.tsv,.txt"
                onChange={handleFileUpload}
                disabled={isOptimizing}
              />
              {rawData.length > 0 && (
                <p className="info-text" style={{color: '#22c55e'}}>✓ {rawData.length} rows</p>
              )}
            </div>
          </div>

          <div className="config-panel" style={{borderColor: '#d4a637'}}>
            <h3 className="config-title">📊 Graph View</h3>
            <div className="btn-grid-2">
              <button
                onClick={() => setMode('cylinder')}
                className={`btn-small ${mode === 'cylinder' ? 'active' : 'inactive'}`}
              >
                Cylinder
              </button>
              <button
                onClick={() => setMode('ratio-throttle')}
                className={`btn-small ${mode === 'ratio-throttle' ? 'active' : 'inactive'}`}
              >
                Ratio/Throttle
              </button>
            </div>
          </div>

          {rawData.length > 0 && (
            <div className="stats-grid">
              <div className={`stat-card ${avgErr < 0.000001 ? 'green' : avgErr < 0.001 ? 'yellow' : 'red'}`}>
                <p className="stat-value">{avgErr.toFixed(8)}</p>
                <p className="stat-label">Avg Error</p>
              </div>
              <div className={`stat-card ${maxErr < 0.000001 ? 'green' : maxErr < 0.01 ? 'yellow' : 'red'}`}>
                <p className="stat-value">{maxErr.toFixed(8)}</p>
                <p className="stat-label">Max Error</p>
              </div>
              <div className={`stat-card ${avgPct < 0.0001 ? 'green' : avgPct < 0.1 ? 'yellow' : 'red'}`}>
                <p className="stat-value">{avgPct.toFixed(6)}%</p>
                <p className="stat-label">Avg %</p>
              </div>
              <div className={`stat-card ${correctRounds >= totalDataPoints * 0.95 ? 'green' : correctRounds >= totalDataPoints * 0.8 ? 'yellow' : 'red'}`}>
                <p className="stat-value">{correctRounds}/{totalDataPoints}</p>
                <p className="stat-label">Correct Rounds</p>
              </div>
            </div>
          )}

          <div className="de-panel">
            <div className="de-header">
              <div className="de-info">
                <h3 className="de-title">🧬 Console</h3>
              </div>
              <button 
                onClick={handleToggle}
                className={`btn ${isOptimizing ? 'btn-danger' : 'btn-success'}`}
                disabled={rawData.length === 0}
                style={{ width: 'auto', padding: '0.5rem 2rem' }}
              >
                {isOptimizing ? 'STOP' : 'START'}
              </button>
            </div>
            
            <div className="de-log">
              {log.length === 0 ? (
                <p className="de-log-empty">Waiting...</p>
              ) : (
                log.map((l, i) => <p key={i} className="de-log-entry">{l}</p>)
              )}
            </div>
            
            {isOptimizing && (
              <p className="de-status">
                Gen {generation} | Fitness: {bestFitness.toFixed(3)}% | Stuck: {stuckCounter}
              </p>
            )}
          </div>

          <div className="de-panel">
            <h3 className="de-title">⚙️ Optimization Settings</h3>
            
            <div className="de-controls">
              <div>
                <label className="de-control-label">Pop: {popSize}</label>
                <input 
                  type="range" 
                  min="20" 
                  max="100" 
                  step="10" 
                  value={popSize} 
                  onChange={e => setPopSize(parseInt(e.target.value))}
                  disabled={isOptimizing}
                />
              </div>
              <div>
                <label className="de-control-label">F: {F.toFixed(2)}</label>
                <input 
                  type="range" 
                  min="0.4" 
                  max="1.2" 
                  step="0.1" 
                  value={F} 
                  onChange={e => setF(parseFloat(e.target.value))}
                  disabled={isOptimizing}
                />
              </div>
              <div>
                <label className="de-control-label">CR: {CR.toFixed(2)}</label>
                <input 
                  type="range" 
                  min="0.5" 
                  max="1.0" 
                  step="0.05" 
                  value={CR} 
                  onChange={e => setCR(parseFloat(e.target.value))}
                  disabled={isOptimizing}
                />
              </div>
            </div>
            
            <div className="de-actions">
              <div className="de-control-group">
                <label className="de-control-label">Max Gens: {maxGens === 0 ? '∞' : maxGens}</label>
                <input 
                  type="range" 
                  min="0" 
                  max="5000" 
                  step="100" 
                  value={maxGens} 
                  onChange={e => setMaxGens(parseInt(e.target.value))}
                  disabled={isOptimizing}
                />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={randomizeParams}
                  className="btn btn-orange"
                  disabled={isOptimizing}
                  style={{ flex: 1 }}
                >
                  🎲 Randomize
                </button>
                <button
                  onClick={() => {
                    setStuckCounter(0);
                    setLastImprovement(generation);
                    addLog('🔄 Diversity injected manually');
                  }}
                  className="btn btn-purple"
                  disabled={!isOptimizing}
                  style={{ flex: 1 }}
                >
                  💥 Boost
                </button>
              </div>
            </div>
          </div>

          {worstValues.length > 0 && (
            <div className="worst-panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <h3 className="worst-title" style={{ margin: 0 }}>Top 10 Worst Errors</h3>
                <button
                  onClick={() => setShowAllErrors(true)}
                  className="btn btn-orange"
                  style={{ width: 'auto', padding: '0.25rem 0.75rem', fontSize: '0.75rem' }}
                >
                  View All ({allWrongValues.length})
                </button>
              </div>
              <div className="worst-grid">
                {worstValues.map((d, i) => (
                  <div key={i} className="worst-card">
                    <p className="worst-label">C{d.cylinders} R{d.ratio} T{d.throttle}</p>
                    <p className="worst-error">±{d.remainingToRound.toFixed(4)}</p>
                    <p className="worst-percent">{d.pct.toFixed(2)}%</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {showAllErrors && (
            <div className="error-overlay" onClick={() => setShowAllErrors(false)}>
              <div className="error-modal" onClick={(e) => e.stopPropagation()}>
                <div className="error-modal-header">
                  <h3 className="error-modal-title">All Wrong Values ({allWrongValues.length})</h3>
                  <button
                    onClick={() => setShowAllErrors(false)}
                    className="error-modal-close"
                  >
                    ✕
                  </button>
                </div>
                <div className="error-modal-content">
                  {allWrongValues.map((d, i) => (
                    <div key={i} className="error-modal-item">
                      <span className="error-modal-label">C{d.cylinders} R{d.ratio} T{d.throttle}</span>
                      <span className="error-modal-actual">Actual: {d.fuel.toFixed(6)}</span>
                      <span className="error-modal-calc">Calc: {d.calc.toFixed(6)}</span>
                      <span className="error-modal-error">±{d.remainingToRound.toFixed(6)}</span>
                      <span className="error-modal-percent">{d.pct.toFixed(4)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="formula-panel">
            <h3 className="formula-title">📋 Formula Code</h3>
            <pre className="formula-code">{generateFormula()}</pre>
          </div>
        </div>

        <div className="right-panel">
          {rawData.length > 0 && (
            <div className="graph-container">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333333" />
                  <XAxis 
                    dataKey={mode === 'cylinder' ? 'cylinders' : 'throttle'} 
                    stroke="#999999"
                    label={{ value: mode === 'cylinder' ? 'Cylinders' : 'Throttle %', position: 'insideBottom', offset: -5, fill: '#999999' }}
                  />
                  <YAxis stroke="#999999" label={{ value: 'Fuel', angle: -90, position: 'insideLeft', fill: '#999999' }} />
                  <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', fontSize: '12px', border: '2px solid #333333' }} />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  
                  {chartLines.map((line, idx) => (
                    <React.Fragment key={line.key}>
                      <Line 
                        type="monotone" 
                        dataKey={`${line.key}_actual`} 
                        stroke={colors[idx % colors.length]} 
                        strokeWidth={2.5}
                        name={mode === 'cylinder' ? `R${line.ratio} T${line.throttle}` : `C${line.cylinders} R${line.ratio}`}
                        dot={{ r: 2 }}
                        connectNulls
                        isAnimationActive={false}
                      />
                      <Line 
                        type="monotone" 
                        dataKey={`${line.key}_calc`} 
                        stroke={colorsDark[idx % colorsDark.length]} 
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        name={mode === 'cylinder' ? `R${line.ratio} T${line.throttle} (calc)` : `C${line.cylinders} R${line.ratio} (calc)`}
                        dot={false}
                        connectNulls
                        isAnimationActive={false}
                      />
                    </React.Fragment>
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;