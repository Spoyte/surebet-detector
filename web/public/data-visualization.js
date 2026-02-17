/** @format */

/**
 * Data Visualization Dashboard
 * 
 * Interactive charts and visualizations for Surebet Detector data
 * using D3.js for advanced data visualization.
 */

class DataVisualizationDashboard {
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.options = {
      theme: options.theme || 'dark',
      refreshInterval: options.refreshInterval || 30000,
      animationDuration: options.animationDuration || 750,
      ...options
    };
    this.charts = {};
    this.data = {};
    this.resizeObserver = null;
  }

  /**
   * Initialize the dashboard
   */
  async initialize() {
    this.container = document.getElementById(this.containerId);
    if (!this.container) {
      throw new Error(`Container #${this.containerId} not found`);
    }

    // Load D3.js if not already loaded
    await this.loadD3();

    // Setup resize observer for responsive charts
    this.setupResizeObserver();

    // Setup theme
    this.applyTheme();

    console.log('✅ Data Visualization Dashboard initialized');
    return this;
  }

  /**
   * Load D3.js from CDN
   */
  loadD3() {
    return new Promise((resolve, reject) => {
      if (window.d3) {
        resolve(window.d3);
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://d3js.org/d3.v7.min.js';
      script.onload = () => resolve(window.d3);
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  /**
   * Setup resize observer for responsive charts
   */
  setupResizeObserver() {
    if (!window.ResizeObserver) return;

    this.resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        this.handleResize(entry);
      }
    });

    this.resizeObserver.observe(this.container);
  }

  /**
   * Handle container resize
   */
  handleResize(entry) {
    const { width } = entry.contentRect;
    
    // Update all charts
    Object.values(this.charts).forEach(chart => {
      if (chart.handleResize) {
        chart.handleResize(width);
      }
    });
  }

  /**
   * Apply theme colors
   */
  applyTheme() {
    this.colors = this.options.theme === 'dark' ? {
      background: '#1a1a2e',
      surface: '#16213e',
      primary: '#0f3460',
      accent: '#e94560',
      text: '#eaeaea',
      textSecondary: '#a0a0a0',
      grid: '#2a2a4a',
      positive: '#4ade80',
      negative: '#f87171',
      warning: '#fbbf24',
      info: '#60a5fa'
    } : {
      background: '#ffffff',
      surface: '#f8fafc',
      primary: '#3b82f6',
      accent: '#ef4444',
      text: '#1e293b',
      textSecondary: '#64748b',
      grid: '#e2e8f0',
      positive: '#22c55e',
      negative: '#ef4444',
      warning: '#f59e0b',
      info: '#3b82f6'
    };
  }

  /**
   * Create profit trend line chart
   */
  createProfitTrendChart(data, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const margin = { top: 20, right: 30, bottom: 40, left: 60 };
    const width = container.clientWidth - margin.left - margin.right;
    const height = 300 - margin.top - margin.bottom;

    // Clear previous chart
    container.innerHTML = '';

    const svg = d3.select(`#${containerId}`)
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Parse dates
    const parseDate = d3.timeParse('%Y-%m-%d');
    data.forEach(d => {
      d.date = parseDate(d.date);
      d.profit = +d.profit;
    });

    // Sort by date
    data.sort((a, b) => a.date - b.date);

    // Scales
    const x = d3.scaleTime()
      .domain(d3.extent(data, d => d.date))
      .range([0, width]);

    const y = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.profit) * 1.1])
      .range([height, 0]);

    // Add grid lines
    svg.append('g')
      .attr('class', 'grid')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x)
        .tickSize(-height)
        .tickFormat(''))
      .style('stroke-dasharray', '3,3')
      .style('stroke-opacity', 0.1);

    svg.append('g')
      .attr('class', 'grid')
      .call(d3.axisLeft(y)
        .tickSize(-width)
        .tickFormat(''))
      .style('stroke-dasharray', '3,3')
      .style('stroke-opacity', 0.1);

    // Line generator
    const line = d3.line()
      .x(d => x(d.date))
      .y(d => y(d.profit))
      .curve(d3.curveMonotoneX);

    // Area generator for gradient fill
    const area = d3.area()
      .x(d => x(d.date))
      .y0(height)
      .y1(d => y(d.profit))
      .curve(d3.curveMonotoneX);

    // Add gradient
    const gradient = svg.append('defs')
      .append('linearGradient')
      .attr('id', 'profit-gradient')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');

    gradient.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', this.colors.positive)
      .attr('stop-opacity', 0.4);

    gradient.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', this.colors.positive)
      .attr('stop-opacity', 0.05);

    // Add area
    svg.append('path')
      .datum(data)
      .attr('fill', 'url(#profit-gradient)')
      .attr('d', area);

    // Add line
    const path = svg.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', this.colors.positive)
      .attr('stroke-width', 2)
      .attr('d', line);

    // Animate line
    const totalLength = path.node().getTotalLength();
    path
      .attr('stroke-dasharray', totalLength + ' ' + totalLength)
      .attr('stroke-dashoffset', totalLength)
      .transition()
      .duration(this.options.animationDuration)
      .ease(d3.easeCubicOut)
      .attr('stroke-dashoffset', 0);

    // Add axes
    svg.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).tickFormat(d3.timeFormat('%b %d')))
      .style('color', this.colors.textSecondary);

    svg.append('g')
      .call(d3.axisLeft(y).tickFormat(d => `€${d}`))
      .style('color', this.colors.textSecondary);

    // Add axis labels
    svg.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', 0 - margin.left)
      .attr('x', 0 - (height / 2))
      .attr('dy', '1em')
      .style('text-anchor', 'middle')
      .style('fill', this.colors.textSecondary)
      .text('Profit (€)');

    // Add dots for data points
    svg.selectAll('.dot')
      .data(data)
      .enter().append('circle')
      .attr('class', 'dot')
      .attr('cx', d => x(d.date))
      .attr('cy', d => y(d.profit))
      .attr('r', 0)
      .attr('fill', this.colors.positive)
      .transition()
      .delay((d, i) => i * 50)
      .duration(500)
      .attr('r', 4);

    // Store chart reference
    this.charts.profitTrend = { svg, x, y, data, handleResize: () => this.createProfitTrendChart(data, containerId) };

    return this.charts.profitTrend;
  }

  /**
   * Create opportunity distribution pie chart
   */
  createOpportunityDistributionChart(data, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const width = container.clientWidth;
    const height = 300;
    const radius = Math.min(width, height) / 2 - 40;

    // Clear previous chart
    container.innerHTML = '';

    const svg = d3.select(`#${containerId}`)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${width / 2},${height / 2})`);

    // Color scale
    const color = d3.scaleOrdinal()
      .domain(data.map(d => d.name))
      .range([
        this.colors.accent,
        this.colors.primary,
        this.colors.info,
        this.colors.warning,
        this.colors.positive,
        '#8b5cf6',
        '#ec4899'
      ]);

    // Pie generator
    const pie = d3.pie()
      .value(d => d.value)
      .sort(null);

    // Arc generator
    const arc = d3.arc()
      .innerRadius(radius * 0.5)
      .outerRadius(radius);

    // Hover arc
    const arcHover = d3.arc()
      .innerRadius(radius * 0.5)
      .outerRadius(radius * 1.05);

    // Create arcs
    const arcs = svg.selectAll('arc')
      .data(pie(data))
      .enter()
      .append('g')
      .attr('class', 'arc');

    // Add paths
    arcs.append('path')
      .attr('d', arc)
      .attr('fill', d => color(d.data.name))
      .attr('stroke', this.colors.background)
      .style('stroke-width', '2px')
      .style('cursor', 'pointer')
      .on('mouseover', function(event, d) {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('d', arcHover);
        
        // Show tooltip
        tooltip.style('opacity', 1)
          .html(`<strong>${d.data.name}</strong><br/>${d.data.value} opportunities (${((d.endAngle - d.startAngle) / (2 * Math.PI) * 100).toFixed(1)}%)`);
      })
      .on('mousemove', function(event) {
        tooltip
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY - 28) + 'px');
      })
      .on('mouseout', function(event, d) {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('d', arc);
        
        tooltip.style('opacity', 0);
      })
      .transition()
      .duration(this.options.animationDuration)
      .attrTween('d', function(d) {
        const i = d3.interpolate(d.startAngle + 0.1, d.endAngle);
        return function(t) {
          d.endAngle = i(t);
          return arc(d);
        };
      });

    // Add center text
    const total = data.reduce((sum, d) => sum + d.value, 0);
    svg.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '-0.2em')
      .style('font-size', '24px')
      .style('font-weight', 'bold')
      .style('fill', this.colors.text)
      .text(total);

    svg.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '1.2em')
      .style('font-size', '12px')
      .style('fill', this.colors.textSecondary)
      .text('Total');

    // Create tooltip
    const tooltip = d3.select('body').append('div')
      .attr('class', 'd3-tooltip')
      .style('opacity', 0)
      .style('position', 'absolute')
      .style('background', this.colors.surface)
      .style('color', this.colors.text)
      .style('padding', '10px')
      .style('border-radius', '6px')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('box-shadow', '0 4px 6px rgba(0,0,0,0.3)');

    // Store chart reference
    this.charts.opportunityDistribution = { 
      svg, 
      data, 
      handleResize: () => this.createOpportunityDistributionChart(data, containerId) 
    };

    return this.charts.opportunityDistribution;
  }

  /**
   * Create bookmaker performance bar chart
   */
  createBookmakerPerformanceChart(data, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const margin = { top: 20, right: 30, bottom: 100, left: 60 };
    const width = container.clientWidth - margin.left - margin.right;
    const height = 350 - margin.top - margin.bottom;

    // Clear previous chart
    container.innerHTML = '';

    const svg = d3.select(`#${containerId}`)
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Sort data by profit
    data.sort((a, b) => b.profit - a.profit);

    // Scales
    const x = d3.scaleBand()
      .range([0, width])
      .domain(data.map(d => d.name))
      .padding(0.2);

    const y = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.profit) * 1.1])
      .range([height, 0]);

    // Add grid
    svg.append('g')
      .attr('class', 'grid')
      .call(d3.axisLeft(y)
        .tickSize(-width)
        .tickFormat(''))
      .style('stroke-dasharray', '3,3')
      .style('stroke-opacity', 0.1);

    // Add bars
    svg.selectAll('rect')
      .data(data)
      .enter()
      .append('rect')
      .attr('x', d => x(d.name))
      .attr('y', height)
      .attr('width', x.bandwidth())
      .attr('height', 0)
      .attr('fill', d => d.profit >= 0 ? this.colors.positive : this.colors.negative)
      .attr('rx', 4)
      .on('mouseover', function(event, d) {
        d3.select(this).attr('opacity', 0.8);
      })
      .on('mouseout', function() {
        d3.select(this).attr('opacity', 1);
      })
      .transition()
      .duration(this.options.animationDuration)
      .delay((d, i) => i * 100)
      .attr('y', d => y(d.profit))
      .attr('height', d => height - y(d.profit));

    // Add value labels on bars
    svg.selectAll('.label')
      .data(data)
      .enter()
      .append('text')
      .attr('class', 'label')
      .attr('x', d => x(d.name) + x.bandwidth() / 2)
      .attr('y', d => y(d.profit) - 5)
      .attr('text-anchor', 'middle')
      .style('fill', this.colors.text)
      .style('font-size', '11px')
      .style('opacity', 0)
      .text(d => `€${d.profit.toFixed(0)}`)
      .transition()
      .delay((d, i) => i * 100 + 500)
      .duration(500)
      .style('opacity', 1);

    // Add axes
    svg.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x))
      .selectAll('text')
      .style('text-anchor', 'end')
      .attr('dx', '-.8em')
      .attr('dy', '.15em')
      .attr('transform', 'rotate(-45)')
      .style('fill', this.colors.textSecondary);

    svg.append('g')
      .call(d3.axisLeft(y).tickFormat(d => `€${d}`))
      .style('color', this.colors.textSecondary);

    // Store chart reference
    this.charts.bookmakerPerformance = { 
      svg, 
      x, 
      y, 
      data, 
      handleResize: () => this.createBookmakerPerformanceChart(data, containerId) 
    };

    return this.charts.bookmakerPerformance;
  }

  /**
   * Create hourly activity heatmap
   */
  createActivityHeatmap(data, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const margin = { top: 30, right: 30, bottom: 50, left: 70 };
    const width = container.clientWidth - margin.left - margin.right;
    const height = 300 - margin.top - margin.bottom;

    // Clear previous chart
    container.innerHTML = '';

    const svg = d3.select(`#${containerId}`)
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Days and hours
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const hours = d3.range(24);

    // Scales
    const x = d3.scaleBand()
      .range([0, width])
      .domain(hours)
      .padding(0.05);

    const y = d3.scaleBand()
      .range([0, height])
      .domain(days)
      .padding(0.05);

    // Color scale
    const colorScale = d3.scaleSequential()
      .interpolator(d3.interpolateViridis)
      .domain([0, d3.max(data, d => d.value)]);

    // Add squares
    svg.selectAll()
      .data(data)
      .enter()
      .append('rect')
      .attr('x', d => x(d.hour))
      .attr('y', d => y(d.day))
      .attr('width', x.bandwidth())
      .attr('height', y.bandwidth())
      .style('fill', d => colorScale(d.value))
      .style('opacity', 0)
      .on('mouseover', function(event, d) {
        d3.select(this).style('stroke', '#fff').style('stroke-width', 2);
      })
      .on('mouseout', function() {
        d3.select(this).style('stroke', 'none');
      })
      .append('title')
      .text(d => `${d.day} ${d.hour}:00 - ${d.value} opportunities`)
      .transition()
      .duration(1000)
      .delay((d, i) => i * 10)
      .style('opacity', 1);

    // Add axes
    svg.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).tickValues([0, 6, 12, 18, 23]))
      .style('color', this.colors.textSecondary);

    svg.append('g')
      .call(d3.axisLeft(y))
      .style('color', this.colors.textSecondary);

    // Add labels
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', -10)
      .attr('text-anchor', 'middle')
      .style('fill', this.colors.textSecondary)
      .style('font-size', '12px')
      .text('Hour of Day');

    // Store chart reference
    this.charts.activityHeatmap = { 
      svg, 
      data, 
      handleResize: () => this.createActivityHeatmap(data, containerId) 
    };

    return this.charts.activityHeatmap;
  }

  /**
   * Update all charts with new data
   */
  updateCharts(data) {
    this.data = { ...this.data, ...data };

    if (data.profitTrend) {
      this.createProfitTrendChart(data.profitTrend, 'profit-trend-chart');
    }

    if (data.opportunityDistribution) {
      this.createOpportunityDistributionChart(data.opportunityDistribution, 'opportunity-distribution-chart');
    }

    if (data.bookmakerPerformance) {
      this.createBookmakerPerformanceChart(data.bookmakerPerformance, 'bookmaker-performance-chart');
    }

    if (data.activityHeatmap) {
      this.createActivityHeatmap(data.activityHeatmap, 'activity-heatmap-chart');
    }
  }

  /**
   * Fetch data from API and update charts
   */
  async fetchAndUpdate() {
    try {
      const response = await fetch('/api/analytics/visualization-data');
      const data = await response.json();
      this.updateCharts(data);
    } catch (error) {
      console.error('Failed to fetch visualization data:', error);
    }
  }

  /**
   * Start auto-refresh
   */
  startAutoRefresh() {
    this.fetchAndUpdate();
    this.refreshInterval = setInterval(() => {
      this.fetchAndUpdate();
    }, this.options.refreshInterval);
  }

  /**
   * Stop auto-refresh
   */
  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  /**
   * Destroy the dashboard
   */
  destroy() {
    this.stopAutoRefresh();
    
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }

    // Remove tooltips
    d3.selectAll('.d3-tooltip').remove();

    // Clear container
    if (this.container) {
      this.container.innerHTML = '';
    }

    this.charts = {};
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DataVisualizationDashboard;
}
