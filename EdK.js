//require(['kinetic-v4.5.5'],
var EdK = {};
(function() {

    EdK.Util = {
        invertColor : function(color){
            var rgb = Kinetic.Util.getRGB(color);

            rgb.r = 255 - rgb.r;
            rgb.g = 255 - rgb.g;
            rgb.b = 255 - rgb.b;

            return 'rgb(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ')';
        },
        addProperties: function(constructor, methods) {
            var key;

            for (key in methods) {
                constructor[key] = methods[key];
            }
        },
        deleteProperties: function(constructor, methods) {
            var key;

            for (key in methods) {
                delete constructor[key];
            }
        }
    };
})();
(function() {
    EdK.SelectableContainer = function(container){
        var obj = container || this;

        obj.on('click.edit', function(event){
            var node = event.targetNode;

            if(node && node.getAttr('editable')){
                if(this.selected){
                    if(this.selected == node){
                        return;
                    }
                    else{
                        this.deselect(node);
                    }
                }

                this.selected = node;
                this.select(node);
            }else if(this.selected){
                this.deselect(this.selected);
                delete this.selected;
            }
        });

        return obj;
    };

    EdK.SelectableContainer.prototype = {
        select : function(node){
            if(!node.selected){
                var edShape = EdK.editableShapes[node.className];
                if(edShape){
                    EdK.Util.addProperties(node, edShape.prototype);
                    edShape.call(node, node);
                    node.draw();
                } else {
                    Kinetic.Util.error("Editable version of this shape doesn't exist.");
                }
            }
        },
        deselect : function(node){
            if(node.selected){
                var clearClip = node.getClearClip();
                node.withdraw();

                node.getLayer().clear(clearClip);
                node.draw();
            }
        },
    };

    EdK.SelectableStage = function(config){
        Kinetic.Stage.call(this,config);
        EdK.SelectableContainer(this);
    };
    Kinetic.Util.extend(EdK.SelectableStage, Kinetic.Stage);
    Kinetic.Util.extend(EdK.SelectableStage, EdK.SelectableContainer);

    EdK.SelectableLayer = function(config){
        Kinetic.Layer.call(this,config);
        EdK.SelectableContainer(this);
    };
    Kinetic.Util.extend(EdK.SelectableLayer, Kinetic.Layer);
    Kinetic.Util.extend(EdK.SelectableLayer, EdK.SelectableContainer);

    EdK.setSelectable = function(container){
        if(container.type == 'Layer' || container.type =='Stage'){
            EdK.SelectableContainer(container);
            EdK.Util.addProperties(container, EdK.SelectableContainer.prototype);
        }else
            Kinetic.Util.error('You only can set selectable layers or stages.');
    };

    EdK.Shape = function(shape, editableRegionsArg){

        var obj = shape || this;
        obj.edk = {};

        //set editable regions
        var mousedownFunc = function(){
            var self = this;
            this.parent._setDragPosition = function(){
                var pPos = this.getStage().getPointerPosition();
                if(pPos){
                    self.attrs.dragFunc.call(self, pPos);
                }
            };
        };

        obj.on('dragend.edit', function(){
            delete this._setDragPosition;
        });

        var mouseoverFunc = function(event){
            event.target.style.cursor = this.attrs.mouseoverCursor.call(this, {x: event.clientX, y:event.clientY});
            //pretty ugly
            this.parent.edk.cursorChanger = this;
        };
        var mouseoutFunc = function(event){
            //since mouseout is fired after mouseover if cursor was already changed by someone else (during mouseover) we don't touch it
            if(this.parent.edk.cursorChanger == this){
                event.target.style.cursor = 'default';
            }
        };


        var editableRegions = editableRegionsArg || obj.getAttr('editableRegions'),
            len = editableRegions.length;

        obj.children = new Kinetic.Collection();

        for(var i = 0; i < len; i++){
            var region = editableRegions[i];

            if(region.attrs.dragFunc){
                region.on('mousedown.edit', mousedownFunc);
            }
            var mouseoverCursor = region.attrs.mouseoverCursor;
            if(mouseoverCursor !== undefined){
                region.on('mouseover.edit', mouseoverFunc);
                region.on('mouseout.edit' , mouseoutFunc);
            }

            region.parent = obj;
            obj.add(region);
        }

        obj.edk.oldDraggable = obj.getDraggable();
        obj.setDraggable(true);
        obj.selected = true;

        obj.edk.originalDrawScene = obj.drawScene;
        obj.drawScene = function() {
            this.edk.originalDrawScene.apply(this, arguments);
            Kinetic.Container.prototype.drawScene.apply(this, arguments);
        };

        obj.edk.originalDrawHit = obj.drawHit;
        obj.drawHit = function() {
            this.edk.originalDrawHit.apply(this, arguments);
            Kinetic.Container.prototype.drawHit.apply(this, arguments);
        };

        return obj;
    };

    EdK.Shape.prototype = {
        getClearClip : function(){
            var pos = this.getAbsolutePosition();

            return {x: pos.x,
                    y: pos.y,
                    width: this.getWidth(),
                    height: this.getHeight()
            };
        },
        withdraw : function(){
            this.setDraggable(this.oldDraggable);
            this.selected = false;

            this.destroyChildren();
            delete this.children;

            delete this.edk;
            delete this.drawScene;
            delete this.drawHit;

            this.off('.edit');

            //TODO take previous offset into account
            this.setPosition(this.getX() - this.getOffsetX(), this.getY() - this.getOffsetY());
            this.setOffset(0,0);
        },
        _validateAdd: function(child){
            if (child.getType() !== 'Shape') {
                Kinetic.Util.error('You may only add shapes to editable shape. (and maybe group in the future)');
            }
        },
        //so we should make EdK.Shape extend from container but we can't because Container extend from Node and we don't want to add any Node function
        //we could skip them but it's a waste of time
        //let's just add what interest us for now
        add: Kinetic.Container.prototype.add,
        getChildren: Kinetic.Container.prototype.getChildren,
        //it may be good to keep childrens when we reselect another shape instead of destroying/rebuilding
        destroyChildren: Kinetic.Container.prototype.destroyChildren,
        _setChildrenIndices: Kinetic.Container.prototype._setChildrenIndices,

        getClipWidth: function() { return 0; },
        getClipHeight: function(){ return 0; },
    };

    EdK.Rect = function(shape){
        var obj = shape || this,

        cornerShape = obj.getAttr('cornerShape'),
        borderShape = obj.getAttr('borderShape'),

       //can't use Kinetic shapes like Rect or Circle because position is static
       cornerNW = obj.getAttr('cornerNW') || cornerShape || new Kinetic.Shape({
            drawFunc: function(canvas){
                var context = canvas.getContext();

                context.beginPath();
                context.arc(0,0,this.parent.getCornerPointRadius(),0,2*Math.PI);

                canvas.fill(this);
            },
        }),
        cornerNE = obj.getAttr('cornerNE') || cornerShape || new Kinetic.Shape({
            drawFunc: function(canvas){
                var context = canvas.getContext();

                context.beginPath();
                context.arc(this.parent.getWidth(),0,this.parent.getCornerPointRadius(),0,2*Math.PI);

                canvas.fill(this);
            },
        }),
        cornerSE = obj.getAttr('cornerSE') || cornerShape || new Kinetic.Shape({
            drawFunc: function(canvas){
                var context = canvas.getContext();

                context.beginPath();
                context.arc(this.parent.getWidth(),this.parent.getHeight(),this.parent.getCornerPointRadius(),0,2*Math.PI);

                canvas.fill(this);
            },
        }),
        cornerSW = obj.getAttr('cornerSW') || cornerShape || new Kinetic.Shape({
            drawFunc: function(canvas){
                var context = canvas.getContext();

                context.beginPath();
                context.arc(0,this.parent.getHeight(),this.parent.getCornerPointRadius(),0,2*Math.PI);

                canvas.fill(this);
            },
        }),
        topBorder = obj.getAttr('borderTop') || borderShape || new Kinetic.Shape({
            drawHitFunc: function(canvas){
                var context = canvas.getContext(),
                    cornerRadius = this.parent.getCornerPointRadius();

                context.beginPath();
                context.moveTo(cornerRadius, 0);
                context.lineTo(this.parent.getWidth() - cornerRadius, 0);

                canvas.stroke(this);
            },
            strokeWidth: 5
        }),
        botBorder = obj.getAttr('borderBot') || borderShape || new Kinetic.Shape({
            drawHitFunc: function(canvas){
                var context = canvas.getContext(),
                    shape = this.parent,
                    cornerRadius = shape.getCornerPointRadius(),
                    y = shape.getHeight();

                context.beginPath();
                context.moveTo(cornerRadius, y);
                context.lineTo(shape.getWidth() - cornerRadius, y);

                canvas.stroke(this);
            },
            strokeWidth: 5
        }),
        leftBorder = obj.getAttr('borderLeft') || borderShape || new Kinetic.Shape({
            drawHitFunc: function(canvas){
                var context = canvas.getContext(),
                    cornerRadius = this.parent.getCornerPointRadius();

                context.beginPath();
                context.moveTo(0, cornerRadius);
                context.lineTo(0, this.parent.getHeight() - cornerRadius);

                canvas.stroke(this);
            },
            strokeWidth: 5
        }),
        rightBorder = obj.getAttr('borderRight') || borderShape || new Kinetic.Shape({
            drawHitFunc: function(canvas){
                var context = canvas.getContext(),
                    shape = this.parent,
                    cornerRadius = shape.getCornerPointRadius(),
                    x = shape.getWidth();

                context.beginPath();
                context.moveTo(x, cornerRadius);
                context.lineTo(x, shape.getHeight() - cornerRadius);

                canvas.stroke(this);
            },
            strokeWidth: 5
        }),
        rotate = shape.getAttr('rotateShape') || new Kinetic.Shape({
            drawFunc: function(canvas){
                var context = canvas.getContext(),
                    shape = this.parent,
                    shapeW = shape.getWidth(),
                    startX = shapeW>>1,
                    y = shape.getHeight()>>1;

                context.beginPath();
                context.moveTo(startX, y);
                context.lineTo(startX + shapeW, y);
                canvas.stroke(this);

                context.beginPath();
                context.arc(startX, y, shapeW,1.925*Math.PI,0.075*Math.PI);

                this.setDashArrayEnabled(false);
                canvas.stroke(this);
                this.setDashArrayEnabled(true);
            },
            drawHitFunc: function(canvas){
                var context = canvas.getContext(),
                    shape = this.parent,
                    shapeW = shape.getWidth();

                context.beginPath();
                context.arc(shapeW>>1, shape.getHeight()>>1, shapeW,1.925*Math.PI,0.075*Math.PI);
                canvas.stroke(this);
            },
        });

        var setFillColor = function(){
            var color = this.getStroke();
            if(!color){
                color = this.getFill();
            }

            color = EdK.Util.invertColor(color);

            cornerNW.setFill(color);
            cornerNE.setFill(color);
            cornerSE.setFill(color);
            cornerSW.setFill(color);
            rotate.setStroke(color);
            rotate.setFill(color);
        };

        setFillColor.call(obj);
        obj.on('fillChange.edit, strokeChange.edit', setFillColor);

        cornerNW.attrs.dragFunc = cornerNE.attrs.dragFunc = cornerSE.attrs.dragFunc = cornerSW.attrs.dragFunc = function(pPos){
            this.parent._setNewSize(pPos, true, true);
        };
        topBorder.attrs.dragFunc = botBorder.attrs.dragFunc = function(pPos){
            this.parent._setNewSize(pPos, false, true);
        };
        leftBorder.attrs.dragFunc = rightBorder.attrs.dragFunc = function(pPos){
            this.parent._setNewSize(pPos, true, false);
        };

        cornerNW.attrs.mouseoverCursor = cornerNE.attrs.mouseoverCursor = cornerSE.attrs.mouseoverCursor = cornerSW.attrs.mouseoverCursor = function(){
            var pPos = Kinetic.Util._getXY(Array.prototype.slice.call(arguments)),
                pos = this.parent.getPosition(),
                angle = Math.atan2(pPos.y - pos.y, pPos.x - pos.x);

            if(angle > 0){
                if(angle < Math.PI/2){
                    return "se-resize";
                }
                return "sw-resize";
            } else{
                if(angle > -Math.PI/2){
                    return "ne-resize";
                }
                return "nw-resize";
            }
        };

        topBorder.attrs.mouseoverCursor = botBorder.attrs.mouseoverCursor = leftBorder.attrs.mouseoverCursor = rightBorder.attrs.mouseoverCursor = function(){
            var pPos = Kinetic.Util._getXY(Array.prototype.slice.call(arguments)),
                pos = this.parent.getPosition(),

                angle = Math.atan2(pPos.y - pos.y, pPos.x - pos.x),
                pi_4 = Math.PI/4;

            if(( angle > pi_4 && angle < 3*pi_4 ) || ( angle < -pi_4 && angle > -3*pi_4 ) ){
                return "ns-resize";
            }
            return "ew-resize";
        };

        rotate.attrs.dragFunc = function(pPos){
            var shape = this.parent,
                centerX = shape.getX() ,
                centerY = shape.getY() ;

            shape.setRotation( Math.atan2(pPos.y - centerX, pPos.x - centerY));
        };

        rotate.attrs.mouseoverCursor = function(){
            return "wait";
        };

        rotate.getDashArray = function(){
            var size = Math.min(this.parent.getWidth(),this.parent.getHeight()) / 10;
            return [size , size/2];
        };

        //TODO take offset into account
        var pos = obj.getPosition(),
            w_2 = obj.getWidth()>>1,
            h_2 = obj.getHeight()>>1;

        obj.setPosition(pos.x + w_2, pos.y + h_2);
        obj.setOffset(w_2, h_2);

        return EdK.Shape(obj, [cornerNW, cornerNE, cornerSE, cornerSW, topBorder, botBorder, leftBorder, rightBorder, rotate]);
    };

    EdK.Rect.prototype = {
        getCornerPointRadius : function(){
            var strokeWidth;
            return (strokeWidth = this.getStrokeWidth() ) ? strokeWidth << 1 : Math.min(this.getWidth(),this.getHeight()) / 15;
        },
        getClearClip : function(){
            var pos = this.getPosition(),
                cornerRadius = this.getCornerPointRadius();

            return {x: pos.x - this.getOffsetX() - cornerRadius,
                    y: pos.y - this.getOffsetY() - cornerRadius,
                    width:  this.getWidth() * 1.5 + 2*cornerRadius,
                    height: this.getHeight() + 2*cornerRadius
            };
        },
        /*
        _getNewWidth: function(vect){
            var shape = this.children[0],
                angle = - this.getRotation();

            return (shape.getWidth()/2) + Math.abs(vect.x*Math.cos(angle) - vect.y*Math.sin(angle));
        },
        _getNewHeight: function(vect){
            var shape = this.children[0],
                angle = -this.getRotation();

            return (shape.getHeight()/2) + Math.abs(vect.x*Math.sin(angle) + vect.y*Math.cos(angle));
        },
        _setNewSize: function(W, H, vect){
            var shape = this.children[0],
                angle = this.getRotation(),

             ///move vect for the center position
                moveLengthX = ( W - shape.getWidth() )/2 * (vect.x < 0?-1:1),
                moveLengthY = ( H - shape.getHeight() )/2 * (vect.y < 0?-1:1),
                moveVectX = moveLengthX*Math.cos(angle) - moveLengthY*Math.sin(angle),
                moveVectY = moveLengthX*Math.sin(angle) + moveLengthY*Math.cos(angle);

            shape.setSize(W, H);
            this.setPosition(this.getX() + moveVectX, this.getY() +  moveVectY);
            this.setOffset(W/2, H/2);
        },
        */
        //regroup in 1 function makes it faster (can cache shape,rotation, width,height and sin/cos
        _setNewSize: function(pPos, resizeWidth, resizeHeight){
            var w = this.getWidth(),
                h = this.getHeight(),
                angle = this.getRotation(),
                sina = Math.sin(angle),
                cosa = Math.cos(angle),
                center = this.getPosition(),

                vectX = pPos.x - center.x,
                vectY = pPos.y - center.y,

                moveLengthX = 0,
                moveLengthY = 0;

            if(resizeWidth){
                var W = (w/2) + Math.abs(vectX*cosa - vectY*-sina);
                moveLengthX = ( W - w )/2 * (vectX < 0?-1:1);

                this.setWidth(W);
                this.setOffsetX(W/2);
            }

            if(resizeHeight){
                var H = (h/2) + Math.abs(vectX*-sina + vectY*cosa);
                moveLengthY = ( H - h )/2 * (vectY < 0?-1:1);

                this.setHeight(H);
                this.setOffsetY(H/2);
            }

            this.setPosition(center.x + moveLengthX*cosa - moveLengthY*sina,
                             center.y + moveLengthX*sina + moveLengthY*cosa
            );
        },
        withdraw: function(){
            EdK.Shape.prototype.withdraw.call(this, false);
            EdK.Util.deleteProperties(EdK.Rect.prototype);
        },
    };

    Kinetic.Util.extend(EdK.Rect, EdK.Shape);

    EdK.editableShapes = {
        Rect: EdK.Rect
    };
})();