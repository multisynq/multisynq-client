// Multisynq Tutorial 3
// Multiuser Chat
// Croquet Labs (C) 2025

class ChatModel extends Multisynq.Model {

  init() {
    this.views = new Map();
    this.participants = 0;
    this.history = []; // { viewId, html } items
    this.lastPostTime = null;
    this.inactivity_timeout_ms = 60 * 1000 * 20; // constant
    this.subscribe(this.sessionId, "view-join", this.viewJoin);
    this.subscribe(this.sessionId, "view-exit", this.viewExit);
    this.subscribe("input", "newPost", this.newPost);
    this.subscribe("input", "reset", this.resetHistory);
  }

  viewJoin(viewId) {
    const existing = this.views.get(viewId);
    if (!existing) {
      const nickname = this.randomName();
      this.views.set(viewId, nickname);
    }
    this.participants++;
    this.publish("viewInfo", "refresh");
  }

  viewExit(viewId) {
    this.participants--;
    this.views.delete(viewId);
    this.publish("viewInfo", "refresh");
  }

  newPost(post) {
    const postingView = post.viewId;
    const nickname = this.views.get(postingView);
    const chatLine = `<b>${nickname}:</b> ${this.escape(post.text)}`;
    this.addToHistory({ viewId: postingView, html: chatLine });
    this.lastPostTime = this.now();
    this.future(this.inactivity_timeout_ms).resetIfInactive();
  }

  addToHistory(item){
    this.history.push(item);
    if (this.history.length > 100) this.history.shift();
    this.publish("history", "refresh");
  }

  resetIfInactive() {
    if (this.lastPostTime !== this.now() - this.inactivity_timeout_ms) return;

    this.resetHistory("due to inactivity");
  }

  resetHistory(reason) {
    this.history = [{ html: `<i>chat reset ${reason}</i>` }];
    this.lastPostTime = null;
    this.publish("history", "refresh");
  }

  escape(text) { // Clean up text to remove html formatting characters
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
  }

  randomName() {
    const names =["Acorn", "Allspice", "Almond", "Ancho", "Anise", "Aoli", "Apple", "Apricot", "Arrowroot", "Asparagus", "Avocado", "Baklava", "Balsamic", "Banana", "Barbecue", "Bacon", "Basil", "Bay Leaf", "Bergamot", "Blackberry", "Blueberry", "Broccoli", "Buttermilk", "Cabbage", "Camphor", "Canaloupe", "Cappuccino", "Caramel", "Caraway", "Cardamom", "Catnip", "Cauliflower", "Cayenne", "Celery", "Cherry", "Chervil", "Chives", "Chipotle", "Chocolate", "Coconut", "Cookie Dough", "Chamomile", "Chicory", "Chutney", "Cilantro", "Cinnamon", "Clove", "Coriander", "Cranberry", "Croissant", "Cucumber", "Cupcake", "Cumin", "Curry", "Dandelion", "Dill", "Durian", "Earl Grey", "Eclair", "Eggplant", "Espresso", "Felafel", "Fennel", "Fig", "Garlic", "Gelato", "Gumbo", "Halvah", "Honeydew", "Hummus", "Hyssop", "Ghost Pepper", "Ginger", "Ginseng", "Grapefruit", "Habanero", "Harissa", "Hazelnut", "Horseradish", "Jalepeno", "Juniper", "Ketchup", "Key Lime", "Kiwi", "Kohlrabi", "Kumquat", "Latte", "Lavender", "Lemon Grass", "Lemon Zest", "Licorice", "Macaron", "Mango", "Maple Syrup", "Marjoram", "Marshmallow", "Matcha", "Mayonnaise", "Mint", "Mulberry", "Mustard", "Natto", "Nectarine", "Nutmeg", "Oatmeal", "Olive Oil", "Orange Peel", "Oregano", "Papaya", "Paprika", "Parsley", "Parsnip", "Peach", "Peanut Butter", "Pecan", "Pennyroyal", "Peppercorn", "Persimmon", "Pineapple", "Pistachio", "Plum", "Pomegranate", "Poppy Seed", "Pumpkin", "Quince", "Raspberry", "Ratatouille", "Rosemary", "Rosewater", "Saffron", "Sage", "Sassafras", "Sea Salt", "Sesame Seed", "Shiitake", "Sorrel", "Soy Sauce", "Spearmint", "Strawberry", "Strudel", "Sunflower Seed", "Sriracha", "Tabasco", "Tahini", "Tamarind", "Tandoori", "Tangerine", "Tarragon", "Thyme", "Tofu", "Truffle", "Tumeric", "Valerian", "Vanilla", "Vinegar", "Wasabi", "Walnut", "Watercress", "Watermelon", "Wheatgrass", "Yarrow", "Yuzu", "Zucchini"];
    return names[Math.floor(Math.random() * names.length)];
  }
}

ChatModel.register("ChatModel");

class ChatView extends Multisynq.View {

  constructor(model) {
    super(model);
    this.model = model;
    sendButton.onclick = () => this.send();
    this.subscribe("history", "refresh", this.refreshHistory);
    this.subscribe("viewInfo", "refresh", this.refreshViewInfo);
    this.refreshHistory();
    this.refreshViewInfo();
    if (model.participants === 1 &&
      !model.history.find(item => item.viewId === this.viewId)) {
      this.publish("input", "reset", "for new participants");
    }
  }

  send() {
    const text = textIn.value;
    textIn.value = "";
    if (text === "/reset") {
      this.publish("input", "reset", "at user request");
    } else {
      this.publish("input", "newPost", {viewId: this.viewId, text});
    }
  }

  refreshViewInfo() {
    nickname.innerHTML = "<b>Nickname:</b> " + this.model.views.get(this.viewId);
    viewCount.innerHTML = "<b>Current Participants:</b> " + this.model.participants;
  }

  refreshHistory() {
    textOut.innerHTML = "<b>Welcome to Multisynq Chat!</b><br><br>" +
      this.model.history.map(item => item.html).join("<br>");
    textOut.scrollTop = Math.max(10000, textOut.scrollHeight);
  }
}

Multisynq.Session.join({
  appId: "io.codepen.multisynq.chat",
  apiKey: "234567_Paste_Your_Own_API_Key_Here_7654321",
  name: "public",
  password: "none",
  model: ChatModel,
  view: ChatView
});