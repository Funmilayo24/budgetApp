const express = require("express");

const { requireUser } = require("../auth");
const debtService = require("../services/debtService");

const router = express.Router();

router.get("/debt-categories", requireUser, (_req, res) => {
  res.json({ categories: debtService.debtCategories });
});

router.get("/debt-planning", requireUser, async (req, res, next) => {
  try {
    const planning = await debtService.listPlanning(req.user.id, req.query.month);
    res.json(planning);
  } catch (error) {
    next(error);
  }
});

router.post("/debts", requireUser, async (req, res, next) => {
  try {
    const debt = await debtService.createDebt(req.user.id, req.body);
    res.status(201).json({ debt });
  } catch (error) {
    next(error);
  }
});

router.get("/debts/:id/history", requireUser, async (req, res, next) => {
  try {
    const history = await debtService.getDebtHistory(req.user.id, req.params.id);
    res.json(history);
  } catch (error) {
    next(error);
  }
});

router.post("/debt-payment-plans", requireUser, async (req, res, next) => {
  try {
    const plan = await debtService.savePaymentPlan(req.user.id, req.body);
    res.json({ plan });
  } catch (error) {
    next(error);
  }
});

router.post("/debt-payments", requireUser, async (req, res, next) => {
  try {
    const result = await debtService.recordDebtPayment(req.user.id, req.body);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
