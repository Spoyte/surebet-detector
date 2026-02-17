/**
 * Data Visualization Dashboard - D3.js Powered Charts
 * Surebet Detector - Interactive Analytics
 */

class DataVisualizationDashboard {
    constructor(containerId, options = {}) {
        this.containerId = containerId;
        this.options = {
            theme: options.theme || 'dark',
            refreshInterval: options.refreshInterval || 30000,
            animations: options.animations !== false,
            ...options
        };
        
        this.charts = {};
        this.data = {};
        this.tooltip = null;
        
        // Color schemes for dark theme
        this.colors = {
            primary: '#e94560',
            secondary: '#0f3460',
            accent: '#533483',
            success: '#4ade80',
            warning: '#fbbf24',
            danger: '#f87171',
            chart: [
                '#e94560', '#0f3460', '#533483', '#4ade80', 
                '#fbbf24', '#f87171', '#60a5fa', '#a78bfa',
                '#34d399', '#fb923c', '#f472b6', '#22d3ee'
            ],
            gradient: {
                profit: ['#e94560', '#ff6b6b'],
                volume: ['#0f3460', '#533483'],
                heatmap: ['#1a1a2e', '#e94560']
            }
        };
        
        this.margin = { top: 20, right: 30, bottom: 40, left: 60 };
    }
    
    async initialize() {
        this.createTooltip();
        this.setupResizeHandler();
        return this;
    }
    
    createTooltip() {
        this.tooltip = d3.select('body')
            .append('div')
            .attr('class', 'd3-tooltip')
            .style('opacity', 0)
            .style('position', 'absolute')
            .style('background', '#16213e')
            .style('color', '#eaeaea')
            .style('padding', '10px')
            .style('border-radius', '6px')
            .style('font-size', '12px')
            .style('pointer-events', 'none')
            .style('box-shadow', '0 4px 12px rgba(0,0,0,0.3)')
            .style('border', '1px solid rgba(255,255,255,0.1)')
            .style('z-index', '1000');
    }
    
    setupResizeHandler() {
        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => this.handleResize(), 250);
        });
    }
    
    handleResize() {
        // Redraw all charts on resize
        Object.keys(this.charts).forEach(chartType => {
            if (this.data[chartType]) {
                this.renderChart(chartType, this.data[chartType]);
            }
        });
    }
    
    updateCharts(data) {
        this.data = { ...this.data, ...data };
        
        if (data.profitTrend) {
            this.renderProfitTrend(data.profitTrend);
        }
        if (data.opportunityDistribution) {
            this.renderOpportunityDistribution(data.opportunityDistribution);
        }
        if (data.bookmakerPerformance) {
            this.renderBookmakerPerformance(data.bookmakerPerformance);
        }
        if (data.activityHeatmap) {
            this.renderActivityHeatmap(data.activityHeatmap);
        }
    }
    
    // ==================== PROFIT TREND CHART ====================
    renderProfitTrend(data) {
        const container = d3.select('#profit-trend-chart');
        container.html(''); // Clear loading state
        
        const containerRect = container.node().getBoundingClientRect();
        const width = containerRect.width - this.margin.left - this.margin.right;
        const height = 300 - this.margin.top - this.margin.bottom;
        
        const svg = container.append('svg')
            .attr('width', width + this.margin.left + this.margin.right)
            .attr('height', height + this.margin.top + this.margin.bottom)
            .append('g')
            .attr('transform', `translate(${this.margin.left},${this.margin.top})`);
        
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
        
        // Gradient definition
        const defs = svg.append('defs');
        const gradient = defs.append('linearGradient')
            .attr('id', 'profit-gradient')
            .attr('x1', '0%')
            .attr('y1', '0%')
            .attr('x2', '0%')
            .attr('y2', '100%');
        
        gradient.append('stop')
            .attr('offset', '0%')
            .attr('stop-color', this.colors.gradient.profit[0])
            .attr('stop-opacity', 0.6);
        
        gradient.append('stop')
            .attr('offset', '100%')
            .attr('stop-color', this.colors.gradient.profit[1])
            .attr('stop-opacity', 0.1);
        
        // Area generator
        const area = d3.area()
            .x(d => x(d.date))
            .y0(height)
            .y1(d => y(d.profit))
            .curve(d3.curveMonotoneX);
        
        // Line generator
        const line = d3.line()
            .x(d => x(d.date))
            .y(d => y(d.profit))
            .curve(d3.curveMonotoneX);
        
        // Add area
        svg.append('path')
            .datum(data)
            .attr('fill', 'url(#profit-gradient)')
            .attr('d', area)
            .style('opacity', 0)
            .transition()
            .duration(1000)
            .style('opacity', 1);
        
        // Add line
        const path = svg.append('path')
            .datum(data)
            .attr('fill', 'none')
            .attr('stroke', this.colors.primary)
            .attr('stroke-width', 2)
            .attr('d', line);
        
        // Animate line
        if (this.options.animations) {
            const totalLength = path.node().getTotalLength();
            path.attr('stroke-dasharray', totalLength + ' ' + totalLength)
                .attr('stroke-dashoffset', totalLength)
                .transition()
                .duration(1500)
                .ease(d3.easeCubicOut)
                .attr('stroke-dashoffset', 0);
        }
        
        // Add dots
        svg.selectAll('.dot')
            .data(data)
            .enter().append('circle')
            .attr('class', 'dot')
            .attr('cx', d => x(d.date))
            .attr('cy', d => y(d.profit))
            .attr('r', 0)
            .attr('fill', this.colors.primary)
            .attr('stroke', '#fff')
            .attr('stroke-width', 2)
            .on('mouseover', (event, d) => {
                this.showTooltip(event, `
                    <strong>${d3.timeFormat('%b %d, %Y')(d.date)}</strong><br/>
                    Profit: €${d.profit.toFixed(2)}<br/>
                    Arbitrage: ${d.arbitrage || 0}<br/>
                    +EV: ${d.ev || 0}
                `);
                d3.select(event.currentTarget).attr('r', 8);
            })
            .on('mouseout', (event) => {
                this.hideTooltip();
                d3.select(event.currentTarget).attr('r', 5);
            })
            .transition()
            .delay((d, i) => i * 50)
            .duration(500)
            .attr('r', 5);
        
        // Add axes
        svg.append('g')
            .attr('transform', `translate(0,${height})`)
            .call(d3.axisBottom(x).tickFormat(d3.timeFormat('%b %d')))
            .style('color', '#a0a0a0')
            .selectAll('text')
            .style('fill', '#a0a0a0');
        
        svg.append('g')
            .call(d3.axisLeft(y).tickFormat(d => `€${d}`))
            .style('color', '#a0a0a0')
            .selectAll('text')
            .style('fill', '#a0a0a0');
        
        // Add grid lines
        svg.append('g')
            .attr('class', 'grid')
            .call(d3.axisLeft(y).tickSize(-width).tickFormat(''))
            .style('stroke-dasharray', '3,3')
            .style('stroke-opacity', 0.1)
            .selectAll('line')
            .style('stroke', '#fff');
        
        this.charts.profitTrend = svg;
    }
    
    // ==================== OPPORTUNITY DISTRIBUTION CHART ====================
    renderOpportunityDistribution(data) {
        const container = d3.select('#opportunity-distribution-chart');
        container.html('');
        
        const containerRect = container.node().getBoundingClientRect();
        const width = containerRect.width;
        const height = 300;
        const radius = Math.min(width, height) / 2 - 40;
        
        const svg = container.append('svg')
            .attr('width', width)
            .attr('height', height)
            .append('g')
            .attr('transform', `translate(${width / 2},${height / 2})`);
        
        // Pie generator
        const pie = d3.pie()
            .value(d => d.value)
            .sort(null);
        
        const arc = d3.arc()
            .innerRadius(radius * 0.5) // Donut chart
            .outerRadius(radius);
        
        const arcHover = d3.arc()
            .innerRadius(radius * 0.5)
            .outerRadius(radius + 10);
        
        // Color scale
        const color = d3.scaleOrdinal()
            .domain(data.map(d => d.name))
            .range(this.colors.chart);
        
        // Draw arcs
        const arcs = svg.selectAll('.arc')
            .data(pie(data))
            .enter().append('g')
            .attr('class', 'arc');
        
        arcs.append('path')
            .attr('d', arc)
            .attr('fill', d => color(d.data.name))
            .attr('stroke', '#1a1a2e')
            .attr('stroke-width', 2)
            .style('cursor', 'pointer')
            .on('mouseover', (event, d) => {
                d3.select(event.currentTarget)
                    .transition()
                    .duration(200)
                    .attr('d', arcHover);
                
                const percent = ((d.endAngle - d.startAngle) / (2 * Math.PI) * 100).toFixed(1);
                this.showTooltip(event, `
                    <strong>${d.data.name}</strong><br/>
                    Opportunities: ${d.data.value}<br/>
                    ${percent}%
                `);
            })
            .on('mouseout', (event, d) => {
                d3.select(event.currentTarget)
                    .transition()
                    .duration(200)
                    .attr('d', arc);
                this.hideTooltip();
            })
            .transition()
            .duration(1000)
            .attrTween('d', function(d) {
                const interpolate = d3.interpolate({ startAngle: 0, endAngle: 0 }, d);
                return function(t) {
                    return arc(interpolate(t));
                };
            });
        
        // Add labels
        arcs.append('text')
            .attr('transform', d => `translate(${arc.centroid(d)})`)
            .attr('text-anchor', 'middle')
            .style('fill', '#fff')
            .style('font-size', '11px')
            .style('font-weight', '600')
            .style('pointer-events', 'none')
            .text(d => {
                const percent = ((d.endAngle - d.startAngle) / (2 * Math.PI) * 100);
                return percent > 5 ? d.data.name : '';
            })
            .style('opacity', 0)
            .transition()
            .delay(1000)
            .duration(500)
            .style('opacity', 1);
        
        // Center text
        svg.append('text')
            .attr('text-anchor', 'middle')
            .attr('dy', '-0.2em')
            .style('fill', '#fff')
            .style('font-size', '24px')
            .style('font-weight', 'bold')
            .text(d3.sum(data, d => d.value));
        
        svg.append('text')
            .attr('text-anchor', 'middle')
            .attr('dy', '1.2em')
            .style('fill', '#a0a0a0')
            .style('font-size', '12px')
            .text('Total');
        
        this.charts.opportunityDistribution = svg;
    }
    
    // ==================== BOOKMAKER PERFORMANCE CHART ====================
    renderBookmakerPerformance(data) {
        const container = d3.select('#bookmaker-performance-chart');
        container.html('');
        
        const containerRect = container.node().getBoundingClientRect();
        const width = containerRect.width - this.margin.left - this.margin.right;
        const height = 300 - this.margin.top - this.margin.bottom;
        
        const svg = container.append('svg')
            .attr('width', width + this.margin.left + this.margin.right)
            .attr('height', height + this.margin.top + this.margin.bottom)
            .append('g')
            .attr('transform', `translate(${this.margin.left},${this.margin.top})`);
        
        // Sort by profit
        data.sort((a, b) => b.profit - a.profit);
        
        // Scales
        const x = d3.scaleBand()
            .domain(data.map(d => d.name))
            .range([0, width])
            .padding(0.3);
        
        const y = d3.scaleLinear()
            .domain([0, d3.max(data, d => d.profit) * 1.1])
            .range([height, 0]);
        
        // Color scale based on profit
        const colorScale = d3.scaleLinear()
            .domain([0, d3.max(data, d => d.profit)])
            .range(['#0f3460', '#e94560']);
        
        // Add bars
        svg.selectAll('.bar')
            .data(data)
            .enter().append('rect')
            .attr('class', 'bar')
            .attr('x', d => x(d.name))
            .attr('width', x.bandwidth())
            .attr('y', height)
            .attr('height', 0)
            .attr('fill', d => colorScale(d.profit))
            .attr('rx', 4)
            .style('cursor', 'pointer')
            .on('mouseover', (event, d) => {
                d3.select(event.currentTarget)
                    .transition()
                    .duration(200)
                    .attr('fill', d3.rgb(colorScale(d.profit)).brighter(0.3));
                
                this.showTooltip(event, `
                    <strong>${d.name}</strong><br/>
                    Profit: €${d.profit.toFixed(2)}<br/>
                    Opportunities: ${d.count}
                `);
            })
            .on('mouseout', (event, d) => {
                d3.select(event.currentTarget)
                    .transition()
                    .duration(200)
                    .attr('fill', colorScale(d.profit));
                this.hideTooltip();
            })
            .transition()
            .duration(800)
            .delay((d, i) => i * 100)
            .attr('y', d => y(d.profit))
            .attr('height', d => height - y(d.profit));
        
        // Add value labels on bars
        svg.selectAll('.label')
            .data(data)
            .enter().append('text')
            .attr('class', 'label')
            .attr('x', d => x(d.name) + x.bandwidth() / 2)
            .attr('y', d => y(d.profit) - 5)
            .attr('text-anchor', 'middle')
            .style('fill', '#fff')
            .style('font-size', '11px')
            .style('opacity', 0)
            .text(d => `€${d.profit.toFixed(0)}`)
            .transition()
            .delay((d, i) => i * 100 + 800)
            .duration(500)
            .style('opacity', 1);
        
        // Add axes
        svg.append('g')
            .attr('transform', `translate(0,${height})`)
            .call(d3.axisBottom(x))
            .style('color', '#a0a0a0')
            .selectAll('text')
            .style('fill', '#a0a0a0')
            .style('text-anchor', 'end')
            .attr('dx', '-.8em')
            .attr('dy', '.15em')
            .attr('transform', 'rotate(-30)');
        
        svg.append('g')
            .call(d3.axisLeft(y).tickFormat(d => `€${d}`))
            .style('color', '#a0a0a0')
            .selectAll('text')
            .style('fill', '#a0a0a0');
        
        this.charts.bookmakerPerformance = svg;
    }
    
    // ==================== ACTIVITY HEATMAP CHART ====================
    renderActivityHeatmap(data) {
        const container = d3.select('#activity-heatmap-chart');
        container.html('');
        
        const containerRect = container.node().getBoundingClientRect();
        const width = containerRect.width - this.margin.left - this.margin.right;
        const height = 350 - this.margin.top - this.margin.bottom;
        
        const svg = container.append('svg')
            .attr('width', width + this.margin.left + this.margin.right)
            .attr('height', height + this.margin.top + this.margin.bottom)
            .append('g')
            .attr('transform', `translate(${this.margin.left},${this.margin.top})`);
        
        // Dimensions
        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const hours = d3.range(24);
        
        const cellWidth = width / hours.length;
        const cellHeight = height / days.length;
        
        // Color scale
        const maxValue = d3.max(data, d => d.value);
        const colorScale = d3.scaleSequential(d3.interpolateInferno)
            .domain([0, maxValue || 1]);
        
        // Create cells
        const cells = svg.selectAll('.cell')
            .data(data)
            .enter().append('rect')
            .attr('class', 'cell')
            .attr('x', d => hours.indexOf(d.hour) * cellWidth)
            .attr('y', d => days.indexOf(d.day) * cellHeight)
            .attr('width', cellWidth - 1)
            .attr('height', cellHeight - 1)
            .attr('fill', '#1a1a2e')
            .attr('rx', 2)
            .style('cursor', 'pointer')
            .on('mouseover', (event, d) => {
                d3.select(event.currentTarget)
                    .transition()
                    .duration(100)
                    .attr('stroke', '#fff')
                    .attr('stroke-width', 2);
                
                this.showTooltip(event, `
                    <strong>${d.day} ${d.hour}:00</strong><br/>
                    Opportunities: ${d.value}
                `);
            })
            .on('mouseout', (event) => {
                d3.select(event.currentTarget)
                    .transition()
                    .duration(100)
                    .attr('stroke', 'none');
                this.hideTooltip();
            });
        
        // Animate color
        cells.transition()
            .duration(1000)
            .delay((d, i) => (days.indexOf(d.day) * hours.length + d.hour) * 10)
            .attr('fill', d => colorScale(d.value));
        
        // Add day labels
        svg.selectAll('.day-label')
            .data(days)
            .enter().append('text')
            .attr('class', 'day-label')
            .attr('x', -10)
            .attr('y', (d, i) => i * cellHeight + cellHeight / 2)
            .attr('dy', '0.35em')
            .attr('text-anchor', 'end')
            .style('fill', '#a0a0a0')
            .style('font-size', '11px')
            .text(d => d);
        
        // Add hour labels (every 3 hours)
        svg.selectAll('.hour-label')
            .data(hours.filter(h => h % 3 === 0))
            .enter().append('text')
            .attr('class', 'hour-label')
            .attr('x', d => hours.indexOf(d) * cellWidth + cellWidth / 2)
            .attr('y', height + 20)
            .attr('text-anchor', 'middle')
            .style('fill', '#a0a0a0')
            .style('font-size', '11px')
            .text(d => `${d}:00`);
        
        // Add legend
        const legendWidth = 200;
        const legendHeight = 10;
        const legendX = width - legendWidth;
        const legendY = -15;
        
        const legendScale = d3.scaleLinear()
            .domain([0, maxValue || 1])
            .range([0, legendWidth]);
        
        const legendAxis = d3.axisBottom(legendScale)
            .ticks(5)
            .tickFormat(d3.format('d'));
        
        // Legend gradient
        const defs = svg.append('defs');
        const legendGradient = defs.append('linearGradient')
            .attr('id', 'heatmap-legend')
            .attr('x1', '0%')
            .attr('x2', '100%');
        
        const numStops = 10;
        for (let i = 0; i < numStops; i++) {
            legendGradient.append('stop')
                .attr('offset', `${(i / (numStops - 1)) * 100}%`)
                .attr('stop-color', colorScale((i / (numStops - 1)) * (maxValue || 1)));
        }
        
        svg.append('rect')
            .attr('x', legendX)
            .attr('y', legendY)
            .attr('width', legendWidth)
            .attr('height', legendHeight)
            .style('fill', 'url(#heatmap-legend)')
            .attr('rx', 2);
        
        svg.append('g')
            .attr('transform', `translate(${legendX},${legendY + legendHeight})`)
            .call(legendAxis)
            .style('color', '#a0a0a0')
            .selectAll('text')
            .style('fill', '#a0a0a0')
            .style('font-size', '9px');
        
        this.charts.activityHeatmap = svg;
    }
    
    // ==================== TOOLTIP HELPERS ====================
    showTooltip(event, content) {
        this.tooltip
            .style('opacity', 1)
            .html(content)
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 28) + 'px');
    }
    
    hideTooltip() {
        this.tooltip.style('opacity', 0);
    }
    
    // ==================== EXPORT FUNCTIONS ====================
    exportChart(chartType, format = 'png') {
        const svg = this.charts[chartType];
        if (!svg) return;
        
        const svgNode = svg.node().parentNode;
        const serializer = new XMLSerializer();
        const svgString = serializer.serializeToString(svgNode);
        
        if (format === 'svg') {
            const blob = new Blob([svgString], { type: 'image/svg+xml' });
            this.downloadBlob(blob, `${chartType}-chart.svg`);
        } else {
            // Convert to PNG
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();
            
            const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(svgBlob);
            
            img.onload = () => {
                canvas.width = svgNode.clientWidth || 800;
                canvas.height = svgNode.clientHeight || 400;
                ctx.fillStyle = '#1a1a2e';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);
                URL.revokeObjectURL(url);
                
                canvas.toBlob(blob => {
                    this.downloadBlob(blob, `${chartType}-chart.png`);
                });
            };
            
            img.src = url;
        }
    }
    
    downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
}

// Make it globally available
window.DataVisualizationDashboard = DataVisualizationDashboard;
