/**
 * QA-domain metric definitions.
 *
 * QA review is not yet implemented as a first-class system. The metric is
 * exposed as a placeholder so curated reports can reserve a slot for it;
 * stat returns null with a sub indicating the feature is not configured.
 * Once a qa_review table or scoring source exists, replace the body of
 * qaScore.computeFor.stat with the real query.
 */
import type { MetricDefinition } from "../types";

const qaScore: MetricDefinition = {
  id:    "qa.score",
  label: "QA Score",
  description: "Quality assurance review score for sampled agent interactions.",
  domain: "qa",
  unit:  "percent",
  supportedVisualizations: ["number"],
  defaultVisualization:    "number",

  computeFor: {
    async stat(_ctx) {
      return {
        type: "stat",
        value: null,
        label: "QA Score",
        unit:  "percent",
        sub:   "Not configured",
      };
    },
  },
};

export const QA_METRICS: MetricDefinition[] = [qaScore];
