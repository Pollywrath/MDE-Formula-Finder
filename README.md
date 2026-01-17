# MDE Formula Finder

A powerful mathematical formula discovery tool using Differential Evolution algorithm to optimize function parameters against datasets. Built with React, Vite, and Recharts.

## Features

- **Multi-Mode Optimization**: 
  - Cylinder-based fuel consumption modeling
  - Ratio/Throttle optimization
  - Combined multivariate analysis
- **Modified Differential Evolution**: Advanced parameter optimization with adaptive strategies
- **Real-time Visualization**: Interactive charts showing fitted curves vs actual data
- **High Precision Output**: 20 decimal places for maximum accuracy
- **Multiple Metrics**: MAPE, Max Error, RMSE tracking
- **Worst-Case Analysis**: Identify and focus on problematic data points

## Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/Pollywrath/MDE-Formula-Finder.git
cd MDE-Formula-Finder
npm install
```

## Usage

### Development

Run the development server:

```bash
npm run dev
```

Open your browser to `http://localhost:3000`

### Build

Build for production:

```bash
npm run build
```

### Deploy to GitHub Pages

```bash
npm run deploy
```

## How to Use

1. **Load Your Data**:
   - Upload CSV/TSV files for cylinder data (varying cylinders)
   - Upload CSV/TSV files for ratio/throttle data (varying ratio/throttle)
   - Format: `cylinders,ratio,throttle,torque,fuel`

2. **Select Optimization Mode**:
   - **Cylinder**: Optimize fuel consumption based on cylinder count
   - **Ratio/Throttle**: Optimize based on gear ratio and throttle position
   - **Combined**: Multivariate optimization using all parameters

3. **Configure & Optimize**:
   - Adjust MDE parameters (Population, F, CR)
   - Set maximum generations or run unlimited
   - Click START to begin optimization
   - Monitor improvements in real-time console

4. **Analyze Results**:
   - View stats: Average Error, Max Error, % Error, Correct Rounds
   - Check worst-case errors in the Top 10 display
   - Visualize fit quality in the interactive chart

5. **Export Formula**:
   - Copy the generated JavaScript function with 20-decimal precision
   - Use directly in your projects

## Configuration Options

### MDE Parameters

- **Population Size (20-100)**: Number of candidate solutions
- **F (0.4-1.2)**: Mutation factor controlling exploration
- **CR (0.5-1.0)**: Crossover rate controlling parameter mixing
- **Max Generations**: Iteration limit (0 = unlimited)

### Optimization Modes

- **Cylinder Mode**: `fuel = baseA*c² + baseB*c + baseC + |amp*sin(2π*c/period + phase)|`
- **Ratio/Throttle Mode**: Piecewise function with power and linear regions
- **Combined Mode**: Integrates both cylinder and ratio/throttle models

## Example Use Cases

- Vehicle fuel consumption modeling across different configurations
- Engine performance optimization
- Multi-parameter curve fitting for complex datasets
- Predictive modeling with high accuracy requirements

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Links

- **Live Demo**: [https://pollywrath.github.io/MDE-Formula-Finder/](https://pollywrath.github.io/MDE-Formula-Finder/)
- **Repository**: [https://github.com/Pollywrath/MDE-Formula-Finder](https://github.com/Pollywrath/MDE-Formula-Finder)
